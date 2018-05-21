'use strict';

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const fs            = require('fs');
const os            = require('os');
const tmp           = require('tmp');
const child_process = require('child_process');

const common        = require('./common');

let _DEFAULT_SET_EXIF_TIMESTAMP_ANSWER = 'Y';
let _DEFAULT_UPDATE_FILE_PATH_ANSWER   = '2';
let _DEFAULT_EXIF_OFFSET_ANSWER        = '';

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class ImageObject {
    static to_gphotos( s ) {
        // do not forget about file name extensions (if any)
        return s.toLowerCase().replace(/[^a-z0-9]/ig,'_').replace(/_+/g,'_').replace(/^_/,'').replace(/_$/,'').replace(/_(jpe?g|png|mp4|mov|vfw)$/i,'.$1');
    }
    constructor( path, parent ) {
        this.relative_path = path.substr(common.imagesRoot.length+1);
        this.path          = path;
        this.gphotos_path  = ImageObject.to_gphotos(this.relative_path);
        this.name          = this.relative_path.replace(/^.+\/([^\/]+)$/,"$1");
        this.gphotos_name  = ImageObject.to_gphotos(this.name);
    }
    toString() {
        return this.path;
    }
}
class ImageFile extends ImageObject {
    guess_date_from_path( relative_path ) {
        // now match the relative_path to different regexps to figure out object date depending on its relative_path
        this.max_discrepancy_minutes = 15*24*60; // Any date in the month will pretty much do
        if( (this.path_parts=common.match_string(relative_path,
                                                 /^([0-9]+)\/([0-9]{1,2}(?![0-9]))?([^\/]*)\/(?:([^/]+)\/)?([0-9]{1,2}(?![0-9]))?([^\/]*)\/(.+)$/,
                                                 ['year','month','endmonth','topic','date','enddate','tail'])) && this.path_parts.date ) {
            this.case_number = 2;
            this.max_discrepancy_minutes = 1;
        }
        else if( (this.path_parts=common.match_string(relative_path,
                                                      /^([0-9]+)\/([0-9]{1,2}(?![0-9]))?([^\/]*)\/(?:([0-9]{1,2}(?![0-9]))?([^/]*)\/(?:([^\/]+)\/)?)?(.+)$/,
                                                      ['year','month','endmonth','date','enddate','topic','tail'])) ) {
            if( this.path_parts.date ) {
                this.case_number = 1;
                this.max_discrepancy_minutes = 1;
            }
            else {
                this.path_parts.date = 15; // date is not available here... so try to improvise
                if( this.path_parts.enddate ) {
                    this.case_number = 3;
                    if( this.path_parts.enddate.match(/^thanksgiving.*$/i) ) {
                        common.log(2,"Defaulting to Thanksgiving for '"+relative_path+"'");
                        this.path_parts.date = 27;
                        this.max_discrepancy_minutes = 2*24*60;
                    }
                    else if( this.path_parts.enddate.match(/^halloween.*$/i) ) {
                        common.log(2,"Defaulting to Halloween for '"+relative_path+"'");
                        this.path_parts.date = 31;
                        this.max_discrepancy_minutes = 2*24*60;
                    }
                    else if( this.path_parts.enddate.match(/^christmas.*$/i) ) {
                        common.log(2,"Defaulting to christmas for '"+relative_path+"'");
                        this.path_parts.date = 24;
                        this.max_discrepancy_minutes = 2*24*60;
                    }
                    else if( this.path_parts.enddate.match(/^newyear.*$/i) ) {
                        common.log(2,"Defaulting to new year for '"+relative_path+"'");
                        this.path_parts.date = (Number(this.path_parts.month)==12) ? 31 : ((Number(this.path_parts.month)==1) ? 1 : 15);
                        this.max_discrepancy_minutes = 2*24*60;
                    }
                }
                else {
                    common.log(1,"File '"+relative_path+"' has strange name: "+JSON.stringify(this.path_parts));
                }
            }
        }
        else {
            return undefined;
        }
        let date = Number(this.path_parts.date);
        if( Number.isNaN(date) || (date<=0) || (date>31) ) {
            // this means that we do not know what date it is. The the date to the middle of the month
            // and increase the max_discrepancy_minutes
            date = 15;
            this.max_discrepancy_minutes = 15*24*60;
        }
        let month = Number(this.path_parts.month);
        if( Number.isNaN(month) || (month<=0) || (month>12) ) {
            // this means that we do not know what month it is. The the month to the middle of the year
            // and increase the max_discrepancy_minutes
            month = 6;
            this.max_discrepancy_minutes = (365/2)*24*60;
        }
        let year = Number(this.path_parts.year);
        return new Date(year,month-1,date,12,0,0);
    }
    guess_date_from_filename( relative_path ) {
        if( !(this.filename_parts=common.match_string(relative_path,
                                                      /^.+\/[^\/]+(?:_|-)([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})\.(?:jpe?g|png|mov|mp4)$/i,
                                                      ['year','month','date','hour','minute','second'])) )
            return undefined;
        // We know the exact timestamp to the seconds. So limit the max discrepancy to 1 minute
        return new Date(Number(this.filename_parts.year),Number(this.filename_parts.month)-1,Number(this.filename_parts.date),
                        Number(this.filename_parts.hour),Number(this.filename_parts.minute),Number(this.filename_parts.second),1);
    }
    constructor(path,parent) {
        super(path,parent);
        this.path_date     = this.guess_date_from_path(this.relative_path);
        this.filename_date = this.guess_date_from_filename(this.relative_path);
    }
    set_exif_dates( exif_dates ) {
        this.min_exif_date = new Date( Math.min(...exif_dates) );
        this.timestamp     = this.filename_date || this.min_exif_date || this.path_date || Date.now();
        this.id            = (String(this.timestamp.valueOf())+"_"+this.gphotos_path).toLowerCase();
        return this;
    }
    names_match( gphotofile ) {
        return this.gphotos_path==gphotofile.name;
    }
    set_exif_timestamp( timestamp ) {
        let exiftool_cmdargs = [
            "ModifyDate",
            "DateTimeOriginal",
            "CreateDate",
            "FirstPhotoDate",
            "LastPhotoDate"
        ];
        common.log(2,"Setting timestamp of '"+this.path+" to '"+timestamp.toEXIFString()+"'");
        let cmdline = "/usr/bin/exiftool -quiet "+exiftool_cmdargs.map( a => "-"+a+"='"+timestamp.toEXIFString()+"'" ).join(" ") +" '"+this.path+"'";
        try {
            child_process.execSync(cmdline);
            return '';
        }
        catch( err ) {
            return "Cannot execute '"+cmdline+"' ("+err+")";
        }
    }
    move_to( path_ ) {
        if( this.path==path_ )
            return ""; // sanity check
        try {
            // First rename creating necessary folders along the way
            path_.substr(common.imagesRoot.length+1).split('/').reduce( (accumulator,basename) => {
                let next_path = accumulator+'/'+basename;
                if( next_path.length==path_.length ) {
                    fs.renameSync(this.path,path_);
                }
                else {
                    try {
                        const stats = fs.statSync(next_path);
                        if( !stats.isDirectory() )
                            throw Error("'"+next_path+"' already exists and it is not a folder");
                    }
                    catch( err ) {
                        fs.mkdirSync(next_path);
                    }
                }
                return next_path;
            },common.imagesRoot);

            // See if the source folder is empty. If so then delete it
            let parent_path    = this.path.substr(0,this.path.length-this.name.length);
            let parent_content = fs.readdirSync(parent_path);
            if( parent_content.length==0 ) {
                if( common.get_answer("Folder '"+parent_path+"' seems to be empty. Would you like to delete it (Y/N)?","y").toLowerCase()=='y' ) {
                    try {
                        fs.rmdirSync(parent_path);
                    }
                    catch( err ) {
                        common.log(2,"Cannot delete folder '"+parent_path+"' ("+err+")");
                    }
                }
            }

            // Patch the instance variables
            this.relative_path = path_.substr(common.imagesRoot.length+1);
            this.path          = path_;
            this.gphotos_path  = ImageObject.to_gphotos(this.relative_path);
            this.name          = this.relative_path.replace(/^.+\/([^\/]+)$/,"$1");
            this.gphotos_name  = ImageObject.to_gphotos(this.name);
            this.path_date     = this.guess_date_from_path(this.relative_path);
            this.filename_date = this.guess_date_from_filename(this.relative_path);
            
            return "";
        }
        catch( err ) {
            return "Cannot create folder for '"+path_+"' ("+err+")";
        }
    }
    does_date_match( dt ) {
        if( !dt ) return false;
        return Math.abs(this.timestamp.valueOf()-dt.valueOf())<=(this.max_discrepancy_minutes*60*1000);
    }
    check_exif_locations() {
        if( this.min_exif_date===undefined )
            throw Error("Image file was not properly initialized");
        // Make sure EXIF timestamps are right
        let result;
        if( !this.does_date_match(this.min_exif_date) ) {
            _DEFAULT_SET_EXIF_TIMESTAMP_ANSWER = common.get_answer(
                "File '"+this.path+"' needs EXIF date updated from '"+(this.min_exif_date?this.min_exif_date.toEXIFString():"n/a")+"' to '"+this.timestamp.toEXIFString()+"'. Do it?",
                _DEFAULT_SET_EXIF_TIMESTAMP_ANSWER);
            if( _DEFAULT_SET_EXIF_TIMESTAMP_ANSWER.toLowerCase()=='y' ) {
                if( (result=this.set_exif_timestamp(this.timestamp))!='' ) {
                    common.log(1,"Cannot set EXIF timestamps of '"+this.path+" to '"+this.timestamp.toEXIFString()+"' ("+result+")");
                }
            }
        }
        else {
            common.log(4,"File '"+this.path+" matches its EXIF tags ("+this.timestamp+"="+this.min_exif_date+")");
        }
        // Make sure path is right
        if( !this.does_date_match(this.path_date) ) {
            // do something else if case_number is 3 - this means that we "guessed" the date and the date
            // and they were not in the original file. Do not put it into the new file name either
            let proposed_path = common.imagesRoot+"/"+
                this.timestamp.getFullYear()+"/"+
                common.pad_number(this.timestamp.getMonth()+1,2)+"."+common.month_names[this.timestamp.getMonth()+1]+"/"+
                ((this.case_number!=3)?common.pad_number(this.timestamp.getDate(),2):"")+this.path_parts.enddate+"/"+
                (this.path_parts.topic ? this.path_parts.topic+"/" : "")+
                this.path_parts.tail;
            if( this.path!=proposed_path ) {
                _DEFAULT_UPDATE_FILE_PATH_ANSWER = common.get_answer(
                    "Date of file '"+this.path+"' determined by its path is not equal to ts '"+this.timestamp.toEXIFString()+"':\n"+
                        "\t1. Move file to '"+proposed_path+"'\n"+
                        "\t2. Update EXIF timestamp to '"+this.path_date.toEXIFString()+"'\n"+
                        "\t3. Delete the file\n"+
                        "\t4. Offset EXIF timestamp\n"+
                        (_DEFAULT_EXIF_OFFSET_ANSWER.length ? "\t5. Offset EXIF timestamp by '"+_DEFAULT_EXIF_OFFSET_ANSWER+"'\n":"")+
                        "\t6. Do nothing\n"+
                        "Please choose 1 to 6",
                    _DEFAULT_UPDATE_FILE_PATH_ANSWER);
                switch( _DEFAULT_UPDATE_FILE_PATH_ANSWER.toLowerCase() ) {
                case '1':
                    if( (result=this.move_to(proposed_path))!='' ) {
                        common.log(1,"Cannot move '"+this.path+" to '"+proposed_path+"' ("+result+")");
                    }
                    break;
                case '2':
                    if( (result=this.set_exif_timestamp(this.path_date))!='' ) {
                        common.log(1,"Cannot set EXIF timestamp of '"+this.path+" to '"+this.path_date+"' ("+result+")");
                    }
                    break;
                case '3':
                    if( (result="not implemented yet")!='' ) {
                        common.log(1,"Cannot delete '"+this.path+"' ("+result+")");
                    }
                    break;
                case '4':
                    _DEFAULT_EXIF_OFFSET_ANSWER = common.get_answer(
                        "Please enter the offset amount (e.g. 1h23m or -1d2m05s)",
                        _DEFAULT_EXIF_OFFSET_ANSWER);
                    // fall through
                case '5':
                    if( _DEFAULT_EXIF_OFFSET_ANSWER.length ) {
                        if( (result=this.set_exif_timestamp(new Date(this.timestamp.valueOf()+common.parse_duration(_DEFAULT_EXIF_OFFSET_ANSWER))))!='' ) {
                            common.log(1,"Cannot set EXIF timestamp of '"+this.path+" to '"+this.path_date+"' ("+result+")");
                        }
                    }
                    break;
                }
            }
        }
        else {
            common.log(4,"File '"+this.path+" matches its path (with precision of "+this.max_discrepancy_minutes+" minutes)");
        }
    }
}
class ImageFolder extends ImageObject {
    constructor(path,parent) {
        super(path,parent);
    }
    dump( loglevel ) {
        this.files.forEach( (fl) => {
            common.log(loglevel,fl);
        });
        this.folders.forEach( (fl) => {
            fl.dump(loglevel);
        });
    }
    check_exif_locations() {
        if( (this.folders==undefined) || (this.files==undefined) ) {
            this.read_file_system();
        }
        this.files.forEach( (fl) => {
            fl.check_exif_locations();
        });
        this.folders.forEach( (fld) => {
            fld.check_exif_locations();
        });
        return "";
    }
    read_file_system() {
        // Read the file system
        let folders = [];
        let files   = [];
        fs.readdirSync(this.path).forEach( (element) => {
            const stats = fs.statSync(this.path+"/"+element);
            if( stats.isDirectory() ) {
                folders.push(new ImageFolder(this.path+"/"+element,this));
            }
            else if( stats.isFile() ) {
                if( element.match(/^.+\.(?:jpg|jpeg|png|mov|mp4)$/i) ) {
                    if( element.indexOf("._")==0 ) {
                        // This is a file created by MacOS. Pests.
                    }
                    else { 
                        files.push(new ImageFile(this.path+"/"+element,this));
                    }
                }
                else {
                    common.log(3,"Found file '"+(this.path+"/"+element)+"' which is not an image, skipping it");
                }
            }
        });
        this.folders = folders;
        this.files   = files;
        return this;
    }
    read( storage ) {
        // Yes, I am aware of https://www.npmjs.com/package/exiftool-vendored but I found it working
        // unreliably, choking on the large number of files (think 20000). More specifically its perl 
        // process seem to die without warning as more and more file names are sent to it on its stdin
        // by exiftool.read(). Once perl dies, the parent node process gets into some sort of busy loop
        // using 100% CPU. 
        //
        // This code instead uses a similar approach but instead of sending the file names one-by-one 
        // it prepares one large cmdline file with all the filenames that EXIF information needs to be 
        // read out of. 
        function populate_folder_files( fld, files ) {
            if( (fld.folders===undefined) || (fld.files===undefined) ) {
                fld.read_file_system();
            }
            fld.files.forEach( f=> {
                files[f.path] = f;
            });
            fld.folders.forEach( f => {
                populate_folder_files(f,files);
            });
            return files;
        }
        let files     = populate_folder_files(this,{});
        let filepaths = Object.keys(files);
        let perl_cmdline_filename = tmp.tmpNameSync();
        return new Promise( (resolve,reject) => {
            let data  = "-json\n"+
                "-fast\n"+
                "-ignoreMinorErrors\n"+
                "-charset\n"+
                "filename=utf8\n"+
                "-ContentCreateDate\n"+
                "-CreateDate\n"+
                "-CreationDatea\n"+
                "-Date\n"+
                "-DateAcquired\n"+
                "-DateCreated\n"+
                "-DateTimeCreated\n"+
                "-DateTimeDigitized\n"+
                "-DateTimeOriginal\n"+
                "-DigitalCreationDate\n"+
                "-FileAccessDate\n"+
                "-FileInodeChangeDate\n"+
                "-FileModifyDate\n"+
                "-FirstPhotoDate\n"+
                "-LastPhotoDate\n"+
                "-MediaCreateDate\n"+
                "-MediaModifyDate\n"+
                "-MetadataDate\n"+
                "-ModifyDate\n"+
                "-SubSecCreateDate\n"+
                "-SubSecModifyDate\n"+
                "-TrackModifyDate\n"+
                filepaths.join("\n");
            return fs.writeFile(perl_cmdline_filename,data,{mode:0x180/*=0600*/},(err) => {
                if( err ) {
                    reject(Error("Cannot write to '"+perl_cmdline_filename+"' ("+err+")"));
                }
                else {
                    resolve();
                }
            });
        }).then( () => {
            let cmdline = "/usr/bin/exiftool -@ "+perl_cmdline_filename;
            return new Promise( (resolve,reject) => {
                common.log(2,"Executing '"+cmdline+"' for "+filepaths.length+" files");
                child_process.exec(cmdline,{'encoding':'utf8','maxBuffer':(4096*filepaths.length)},(err,stdout,stderr) => {
                    if( err ) {
                        reject(err);
                    }
                    else {
                        let exifinfo = JSON.parse(stdout);
                        common.log(1,"Got EXIF information about "+exifinfo.length+" files, now matching it back to files");
                        exifinfo.forEach( ei => {
                            if( files.hasOwnProperty(ei.SourceFile) ) {
                                let exif_dates = Object.keys(ei).map( k => Date.fromEXIFString(ei[k]) ).filter( dt => (dt.toString()!='Invalid Date') );
                                files[ei.SourceFile].set_exif_dates(exif_dates);
                            }
                            else {
                                common.log(1,"Hm... the name of file '"+ei.SourceFile+"' showed up in '"+perl_cmdline_filename+"' but we do not know this file");
                            }
                        });
                        resolve();
                    }
                });
            }).then( () => {
                let files_without_exif_info = 0;
                Object.values(files).forEach( f => {
                    if( (f.timestamp===undefined) || (f.id===undefined) ) {
                        if( files_without_exif_info<10 ) {
                            common.log(1,"Were not able to find EXIF info for '"+f.path+"'");
                        }
                        files_without_exif_info++;
                    }
                    else {
                        storage.add(f.id,f);
                    }
                });
            }).catch( (err) => {
                common.log(1,"Cannot execute '"+cmdline+"' ("+err+")");
            });
        }).then( () => {
            common.log(3,"Removing cmd line file '"+perl_cmdline_filename+"'");
            fs.unlinkSync(perl_cmdline_filename);
            return storage;
        });
    }
}
/////////////////////////////////////////////////////////////////
// 
/////////////////////////////////////////////////////////////////
module.exports = {
    'ImageFolder' : ImageFolder,
    'ImageFile'   : ImageFile
};
