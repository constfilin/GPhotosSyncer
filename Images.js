'use strict';

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const fs            = require('fs');
const os            = require('os');
const tmp           = require('tmp');
const child_process = require('child_process');

const common        = require('./common');
const Storage       = require('./Storage');

let _UPDATE_FILE_PATH_ANSWER   = '2';
let _LAST_EXIF_OFFSET          = undefined;
let _LAST_SET_EXIFDATE_ANSWER  = new Date("Invalid Date");

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class ImageFile {
    static get_exif_date_tags( include_extras ) {
        let basic = [
            "ModifyDate",
            "DateTimeOriginal",
            "CreateDate"
        ];
        let extras = [
            "FirstPhotoDate",
            "LastPhotoDate",
            "ContentCreateDate",
            "CreationDate",
            "Date",
            "DateAcquired",
            "DateCreated",
            "DateTimeCreated",
            "DateTimeDigitized",
            "DigitalCreationDate",
            "FileModifyDate",
            "MediaCreateDate",
            "MediaModifyDate",
            "MetadataDate",
            "SubSecCreateDate",
            "SubSecModifyDate",
            "TrackModifyDate"
        ];
        return include_extras ? basic.concat(extras) : basic;
    }
    static to_gphotos( s ) {
        // do not forget about file name extensions (if any)
        return s.toLowerCase().replace(/[^a-z0-9]/ig,'_').replace(/_+/g,'_').replace(/^_/,'').replace(/_$/,'').replace(/_(jpe?g|png|mp4|mov|vfw)$/i,'.$1');
    }
    static init( self, path, all_exif_dates ) {
        // Paths
        self.path           = path;
        self.relative_path  = path.substr(common.imagesRoot.length+1);
        self.gphotos_path   = self.constructor.to_gphotos(self.relative_path);
        self.name           = self.relative_path.replace(/^.+\/([^\/]+)$/,"$1");
        // Dates
        self.path_date      = self.guess_date_from_path(self.relative_path);
        self.filename_date  = self.guess_date_from_filename(self.relative_path);
        self.all_exif_dates = all_exif_dates;
        self.exif_date      = self.constructor.get_exif_date_tags(0).reduce( (accumulator,t) => {
            if( all_exif_dates.hasOwnProperty(t) && all_exif_dates[t] ) {
                if( all_exif_dates[t].valueOf()<accumulator.valueOf() )
                    accumulator = all_exif_dates[t];
            }
            return accumulator;
        },Date.now());
        self.timestamp      = self.filename_date || self.exif_date || self.path_date || Date.now();
        // ID depends on the timestamp and the path
        self.id             = (String(self.timestamp.valueOf())+"_"+self.gphotos_path).toLowerCase();
    }
    static serialize( self ) {
        return {'path':self.path,'all_exif_dates':Object.map(self.all_exif_dates,Date.toEXIFString)};
    }
    static deserialize( js ) {
        return new ImageFile(js.path,Object.map(js.all_exif_dates,Date.fromEXIFString));
    }
    guess_date_from_path( relative_path ) {
        // now match the relative_path to different regexps to figure out object date depending on its relative_path
        this.max_discrepancy_minutes = 15*24*60; // Any date in the month will pretty much do
        if( (this.path_parts=common.match_string(relative_path,
                                                 /^([0-9]+)\/([0-9]{1,2}(?![0-9]))?([^\/]*)\/(?:([^/]+)\/)?([0-9]{1,2}(?![0-9]))?([^\/]*)\/(.+)$/,
                                                 ['year','month','endmonth','topic','date','enddate','tail'])) && this.path_parts.date ) {
            this.case_number = 2;
            this.max_discrepancy_minutes = 24*60;
        }
        else if( (this.path_parts=common.match_string(relative_path,
                                                      /^([0-9]+)\/([0-9]{1,2}(?![0-9]))?([^\/]*)\/(?:([0-9]{1,2}(?![0-9]))?([^/]*)\/(?:([^\/]+)\/)?)?(.+)$/,
                                                      ['year','month','endmonth','date','enddate','topic','tail'])) ) {
            if( this.path_parts.date ) {
                this.case_number = 1;
                this.max_discrepancy_minutes = 24*60;
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
                        this.max_discrepancy_minutes = 24*60;
                    }
                    else if( this.path_parts.enddate.match(/^christmas.*$/i) ) {
                        common.log(2,"Defaulting to christmas for '"+relative_path+"'");
                        this.path_parts.date = 24;
                        this.max_discrepancy_minutes = 24*60;
                    }
                    else if( this.path_parts.enddate.match(/^newyear.*$/i) ) {
                        common.log(2,"Defaulting to new year for '"+relative_path+"'");
                        this.path_parts.date = (Number(this.path_parts.month)==12) ? 31 : ((Number(this.path_parts.month)==1) ? 1 : 15);
                        this.max_discrepancy_minutes = 2*24*60;
                    }
                }
                else {
                    common.log(3,"File '"+relative_path+"' has strange name: "+JSON.stringify(this.path_parts));
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
        this.max_discrepancy_minutes = 1;
        return new Date(Number(this.filename_parts.year),Number(this.filename_parts.month)-1,Number(this.filename_parts.date),
                        Number(this.filename_parts.hour),Number(this.filename_parts.minute),Number(this.filename_parts.second),1);
    }
    change_exif_date( exif_date ) {
        if( this.exif_date.valueOf()==exif_date.valueOf() )
            return ""; // sanity check
        common.log(2,"Setting EXIF date of '"+this.path+"' to '"+Date.toEXIFString(exif_date)+"'");
        let main_exif_tags = this.constructor.get_exif_date_tags(0); 
        let cmdline = "/usr/bin/exiftool -quiet "+main_exif_tags.map( a => "-"+a+"='"+Date.toEXIFString(exif_date)+"'" ).join(" ") +" '"+this.path+"'";
        try {
            child_process.execSync(cmdline);
            this.constructor.init(this,this.path,Object.map(this.all_exif_dates,(d,key) => {
                return main_exif_tags.includes(key) ? exif_date : d;
            }));
            return '';
        }
        catch( err ) {
            return "Cannot execute '"+cmdline+"' ("+err+")";
        }
    }
    change_path( path_ ) {
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
            this.constructor.init(this,path_,this.all_exif_dates);
            return '';
        }
        catch( err ) {
            return "Cannot create folder for '"+path_+"' ("+err+")";
        }
    }
    constructor( path, all_exif_dates ) {
        this.constructor.init(this,path,all_exif_dates);
    }
    toString() {
        return this.path;
    }
    check_exif_timestamps() {
        if( !this.exif_date )
            throw Error("Image file was not properly initialized");

        console.log(this);

        function get_timestamp_path( im, ts ) {
            // If the time difference is within the max discrepancy then do not suggesting anything new
            if( im.exif_date && Math.abs(im.exif_date.valueOf()-ts.valueOf())<(im.max_discrepancy_minutes*60*1000) )
                return im.path; 

            // do something else if case_number is 3 - this means that we "guessed" the date and the date
            // and they were not in the original file. Do not put it into the new file name either
            return common.imagesRoot+"/"+
                ts.getFullYear()+"/"+
                common.pad_number(ts.getMonth()+1,2)+"."+common.month_names[ts.getMonth()+1]+"/"+
                ((im.case_number!=3)?common.pad_number(ts.getDate(),2):"")+(im.path_parts.enddate?im.path_parts.enddate:"")+"/"+
                (im.path_parts.topic ? im.path_parts.topic+"/" : "")+
                im.path_parts.tail;
        }

        let suggestions = {
            date : {},
            path : {}
        }
        
        // Guess the possible new date based on existing EXIF tags
        suggestions.date.closest_exif_date = this.path_date ? Object.keys(this.all_exif_dates).reduce( (accumulator,key) => {
            let offset = Math.abs(this.path_date.valueOf()-this.all_exif_dates[key].valueOf());
            if( offset<accumulator.offset ) {
                accumulator.offset = offset;
                accumulator.value  = this.all_exif_dates[key];
            }
            return accumulator;
        },{'offset':Number.POSITIVE_INFINITY,'value':this.exif_date}).value : undefined;
        suggestions.date.previous_offset   = this.path_date ? new Date(_LAST_EXIF_OFFSET ? suggestions.date.closest_exif_date.valueOf()+_LAST_EXIF_OFFSET : this.exif_date.valueOf()) : undefined;

        suggestions.path.timestamp         = this.timestamp ? get_timestamp_path(this,this.timestamp) : undefined;
        suggestions.path.exif_date         = this.exif_date ? get_timestamp_path(this,this.exif_date) : undefined;
        suggestions.path.closest_exif_date = suggestions.date.closest_exif_date ? get_timestamp_path(this,suggestions.date.closest_exif_date) : undefined;

        let options = {};
        if( suggestions.date.closest_exif_date && Math.abs(suggestions.date.closest_exif_date.valueOf()-this.exif_date.valueOf())>(this.max_discrepancy_minutes*60*1000) ) {
            options[1] = [
                "Set EXIF date to '"+Date.toEXIFString(suggestions.date.closest_exif_date)+"'",
                () => {
                    _LAST_EXIF_OFFSET = this.exif_date.valueOf()-suggestions.date.closest_exif_date.valueOf();
                    common.log(3,"Setting _LAST_EXIF_OFFSET to "+Date.value_to_offset(_LAST_EXIF_OFFSET));
                    return this.change_exif_date(suggestions.date.closest_exif_date);
                }
            ];
        }
        if( suggestions.date.previous_offset && Math.abs(suggestions.date.previous_offset.valueOf()-this.exif_date.valueOf())>(this.max_discrepancy_minutes*60*1000) ) {
            if( suggestions.date.previous_offset.valueOf()!=suggestions.date.closest_exif_date.valueOf() ) {
                options[2] = [
                    "Set EXIF date to '"+Date.toEXIFString(suggestions.date.previous_offset)+"'",
                    () => {
                        _LAST_EXIF_OFFSET = this.exif_date.valueOf()-suggestions.date.previous_offset.valueOf();
                        common.log(3,"Setting _LAST_EXIF_OFFSET to "+Date.value_to_offset(_LAST_EXIF_OFFSET));
                        return change_exif_date_to(this,suggestions.date.previous_offset);
                    }
                ];
            }
        }
        if( suggestions.path.timestamp && 
            suggestions.path.timestamp!=this.path ) {
            options[3] = [
                "Move file to '"+suggestions.path.timestamp.substr(common.imagesRoot.length+1)+"'",
                () => this.change_path(suggestions.path.timestamp)
            ];
        }
        if( (suggestions.path.exif_date) && 
            (suggestions.path.exif_date!=this.path) && 
            (suggestions.path.exif_date!=suggestions.path.timestamp) ) {
            options[4] = [
                "Move file to '"+suggestions.path.exif_date.substr(common.imagesRoot.length+1)+"'",
                () => this.change_path(suggestions.path.exif_date)
            ];
        }
        if( (suggestions.path.closest_exif_date) && 
            (suggestions.path.closest_exif_date!=this.path) && 
            (suggestions.path.closest_exif_date!=suggestions.path.timestamp) && 
            (suggestions.path.closest_exif_date!=suggestions.path.exif_date) ) {
            options[5] = [
                "Move file to '"+suggestions.path.closest_exif_date.substr(common.imagesRoot.length+1)+"'",
                () => this.change_path(suggestions.path.closest_exif_date)
            ];
        }
        if( JSON.stringify(options)!="{}" ) {
            options[6] = [
                "Set EXIF date to something else",
                () => {
                    _LAST_SET_EXIFDATE_ANSWER = Date.fromEXIFString(common.get_answer("Enter new EXIF date",Date.toEXIFString(_LAST_SET_EXIFDATE_ANSWER)));
                    return (_LAST_SET_EXIFDATE_ANSWER.toString()!="Invalid Date") ? this.change_exif_date(_LAST_SET_EXIFDATE_ANSWER) : "wrong EXIF date";
                }
            ];
            options[7] = [
                "Move file to somewhere else under '"+common.imagesRoot+"'",
                () => {
                    let new_path = common.get_answer("Enter new path under '"+common.imagesRoot+"'");
                    return (new_path.length>0) ? this.change_path(common.imagesRoot+"/"+new_path) : "wrong path name";
                }
            ]
            options[8] = [
                "Dump all EXIF dates",
                () => {
                    console.log(Object.keys(this.all_exif_dates).map(k => "\t"+k+" => "+Date.toEXIFString(this.all_exif_dates[k])).join("\n"));
                    _UPDATE_FILE_PATH_ANSWER = '6';
                    return 'choose again';
                }
            ];
            options[9] = [
                "Dump ImageFile object",
                () => {
                    console.log(JSON.stringify(this));
                    return 'choose again';
                }
            ];
            options[0] = [
                "Do nothing (skip file)",
                () => {
                    return '';
                }
            ];
            while( true ) {
                _UPDATE_FILE_PATH_ANSWER = common.get_answer(
                    "\nDate of file '"+this.path+"' determined by its path '"+Date.toEXIFString(this.path_date)+"' is not equal to '"+Date.toEXIFString(this.exif_date)+"':\n"+
                        Object.values(Object.map(options,(opt,ndx) => "\t"+ndx+". "+opt[0])).join("\n")+"\n"+
                        "Please make your choices (comma separated)",
                    _UPDATE_FILE_PATH_ANSWER);
                let result = _UPDATE_FILE_PATH_ANSWER.split(",").map(k => Number(k.trim())).map( choice => {
                    return options.hasOwnProperty(choice) ? options[choice][1]() : "Choice "+choice+" is invalid";
                });
                if( result.join("")=="" )
                    break;
                console.log("There were errors ("+result.join(",")+")");
            }
        }
    }
}
class Images {
    // private methods
    static get_folder_filepaths( path, filepaths ) {
        // Read the file system
        let entries;
        try {
            entries = fs.readdirSync(path);
        }
        catch( err ) {
            if( err.code=='ENOENT' )
                return filepaths;
            throw err;
        }
        entries.forEach( (element) => {
            const stats = fs.statSync(path+"/"+element);
            if( stats.isDirectory() ) {
                this.get_folder_filepaths(path+"/"+element,filepaths);
            }
            else if( stats.isFile() ) {
                if( element.match(/^.+\.(?:jpg|jpeg|png|mov|mp4)$/i) ) {
                    if( element.indexOf("._")==0 ) {
                        // This is a file created by MacOS. Pests.
                    }
                    else {
                        filepaths.push(path+"/"+element);;
                    }
                }
                else {
                    common.log(3,"Found file '"+(path+"/"+element)+"' which is not an image, skipping it");
                }
            }
        });
        return filepaths;
    }
    static get_image_files( filepaths ) {
        if( filepaths.length==0 )
            return Promise.resolve([]);
        let perl_cmdline_filename = tmp.tmpNameSync();
        return new Promise( (resolve,reject) => {
            let data  = "-json\n"+
                "-fast\n"+
                "-ignoreMinorErrors\n"+
                "-charset\n"+
                "filename=utf8\n"+
                ImageFile.get_exif_date_tags(1).map(t=>"-"+t).join("\n")+"\n"+
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
            return new Promise( (resolve,reject) => {
                let cmdline = "/usr/bin/exiftool -@ "+perl_cmdline_filename;
                common.log(2,"Executing '"+cmdline+"' for "+filepaths.length+" files");
                child_process.exec(cmdline,{'encoding':'utf8','maxBuffer':(4096*filepaths.length)},(err,stdout,stderr) => {
                    if( err ) {
                        reject(Error("Cannot execute '"+cmdline+"' ("+err+")"));
                    }
                    else {
                        resolve(JSON.parse(stdout));
                    }
                });
            });
        }).then( (exifinfo) => {
            common.log(4,"Removing cmd line file '"+perl_cmdline_filename+"'");
            fs.unlinkSync(perl_cmdline_filename);
            return exifinfo;
        }).then( (exifinfo) => {
            common.log(1,"Got EXIF information about "+exifinfo.length+" files, now matching it back to files");
            // exiftool prints out a JSON array of objects each of which contains "SourceFile" and all
            // the dates exiftool was able to find. Convert this array to a hash indexed by SourceFile
            exifinfo = Array.rehash(exifinfo,ei => ei.SourceFile);
            let result = [];
            let files_without_exif_info = filepaths.reduce( (accumulator,fp) => {
                if( exifinfo.hasOwnProperty(fp) ) {
                    // Enumerate all EXIF properties, convert them to dates and choose the minimal date as the date when the image was made 
                    result.push(new ImageFile(fp,Object.filter(Object.map(exifinfo[fp],v=>Date.fromEXIFString(v)),dt=>(dt.toString()!='Invalid Date'))));
                }
                else {
                    if( accumulator++<10 ) {
                        common.log(1,"Was not able to find EXIF info for '"+fp+"'");
                    }
                }
                return accumulator;
            },0);
            if( files_without_exif_info>0 ) {
                common.log(1,"Was not able to get EXIF info for "+files_without_exif_info+" files");
            }
            return result;
        });
    }
    //
    constructor() {
        try {
            this.storage = new Storage(common.imagesCache);
            this.storage.storage = this.storage.map(ImageFile.deserialize);
            this.storage_path = common.imagesRoot;
            common.log(2,"Successfully restored images from cache '"+common.imagesCache+"', number of images is "+this.storage.size);
        }
        catch( err ) {
            this.storage = undefined;
        }
        process.on('exit', (code) => {
            if( this.storage && (this.storage_path==common.imagesRoot) ) {
                // TODO: check if storage has changed (probably by counting an SHA hash of it)
                common.log(2,"Storing images to '"+common.imagesCache+"'");
                fs.writeFileSync(common.imagesCache,JSON.stringify(this.storage.map(ImageFile.serialize)));
            }
        });
    }
    read( path ) {
        // If the storage already represents this path then exit immediately (i.e. we re-read the file system
        // only if a new different path was passed or if we have no storage at all)
        if( this.storage && (path==this.storage_path) )
            return Promise.resolve(this);
        return this.constructor.get_image_files(this.constructor.get_folder_filepaths(path,[])).then( (imagefiles) => {
            if( this.storage && path.indexOf(this.storage_path)==0 ) {
                // We just have re-read a part of the file tree represented by this.storage. Let's update this.storage
                common.log(3,"Removing from storage everything that starts with '"+path+"'");
                for( let key in this.storage.storage ) {
                    if( this.storage.storage[key].path.indexOf(path)==0 ) {
                        this.storage.del(key);
                    }
                }
                common.log(3,"Adding to storage "+storage.size+" files that are in '"+path+"'");
            }
            else {
                // We either didn't have storage at all or re-read a completely independent part of the filesystem
                this.storage_path = path;
                this.storage      = new Storage();
            }
            imagefiles.forEach(im => this.storage.add(im.id,im));
            return this;
        });
    }        
    check_exif_timestamps( predicate ) {
        let changed_files = Object.values(this.storage.filter(predicate)).filter( (imageFile) => {
            // Detect if the file has changed by compary JSON representations of it before and after
            let oldid   = imageFile.id;
            let oldfile = JSON.stringify(imageFile); 
            imageFile.check_exif_timestamps();
            if( oldfile==JSON.stringify(imageFile) ) 
                return false;
            if( oldid!=imageFile.id ) {
                this.storage.del(oldid);
                this.storage.add(imageFile.id,imageFile);
            }
            return true;
        });
        return changed_files.length;
    }
    removeId( id ) {
        let im  = this.storage.del(id);
        if( !im ) 
            throw Error("id '"+id+" is not known");
        fs.unlinkSync(im.path);
        return Promise.resolve(im);
    }
    updateId( id ) {
        let im = this.storage.get(id);
        if( !im )
            throw Error("id '"+id+"' is not known");
        return this.constructor.get_image_files([im.path]).then( (imagefiles) => {
            this.storage.del(id);
            im = imagefiles[0];
            this.storage.add(im.id,im);
            return im;
        });
    }
}
module.exports = Images;
