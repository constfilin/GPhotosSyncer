'use strict';

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const fs            = require('fs');
const os            = require('os')
const async         = require('async');
const child_process = require('child_process');

const common        = require('./common');
const Storage       = require('./Storage');

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
    return new common.EXIFDate(year,month-1,date,12,0,0);
  }
  guess_date_from_filename( relative_path ) {
    if( !(this.filename_parts=common.match_string(relative_path,
						  /^.+\/[^\/]+(?:_|-)([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})\.(?:jpe?g|png|mov)$/i,
						  ['year','month','date','hour','minute','second'])) )
      return undefined;
    // We know the exact timestamp to the seconds. So limit the max discrepancy to 1 minute
    return new common.EXIFDate(Number(this.filename_parts.year),Number(this.filename_parts.month)-1,Number(this.filename_parts.date),
			       Number(this.filename_parts.hour),Number(this.filename_parts.minute),Number(this.filename_parts.second),1);
  }
  constructor(path,parent) {
    super(path,parent);
    this.path_date     = this.guess_date_from_path(this.relative_path);
    this.filename_date = this.guess_date_from_filename(this.relative_path);
  }
  _initialize_storage_fields( callback ) {
    // A couple of fields necessary to keep this in storage
    this.timestamp = this.filename_date || this.min_exif_date || this.path_date;
    this.id        = (String(this.timestamp.valueOf())+"_"+this.gphotos_path).toLowerCase();
    callback(null,this);	      
  }
  read_exif_info( callback ) {    
    if( this.min_exif_date ) {
      callback(null,this);
    }
    else {
      let self = this;
      common.exiftool.read(this.path).then( (tags) => {
	let exif_dates = Object.keys(tags).filter( k => (tags[k] instanceof common.exiftool_dt) && (k!='ProfileDateTime') ).map( k => tags[k] );
	exif_dates = exif_dates.map( t => new Date(t.year,t.month-1,t.day,t.hour,t.minute,t.second,t.millis) );
	self.min_exif_date = new common.EXIFDate(new Date( Math.min(...exif_dates) ) );
	self._initialize_storage_fields(callback);
      }).catch( (err) => {
	common.log(2,"Cannot read EXIF info of '"+self.path+"' ("+err+")");
	self.min_exif_date = undefined;
	self._initialize_storage_fields(callback);
      });
    }
  }
  names_match( gphotofile ) {
    return this.gphotos_path==gphotofile.name;
  }
  set_exif_timestamp( exif_timestamp ) {
    let exiftool_cmdargs = [
      "ModifyDate",
      "DateTimeOriginal",
      "CreateDate"
    ];
    let cmdline = "/usr/bin/exiftool -quiet "+exiftool_cmdargs.map( a => "-"+a+"='"+exif_timestamp+"'" ).join(" ") +" '"+this.path+"'";
    try {
      let result = undefined;
      child_process.exec(cmdline,function( err, stdout, stderr ) {
	if( err )
	  throw err;
	result = '';
      });
      deasync.loopWhile(function() {
	return result===undefined;
      });
      return result;
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
    // Make sure EXIF timestamps are right
    let default_answer='y',result;
    if( !this.does_date_match(this.min_exif_date) ) {
      default_answer = common.get_answer(
	"File '"+this.path+"' needs EXIF date updated from '"+(this.min_exif_date?this.min_exif_date.toEXIFString():"n/a")+"' to '"+this.timestamp.toEXIFString()+"'. Do it?",
	default_answer);
      if( default_answer.toLowerCase()=='y' ) {
	if( (result=this.set_exif_timestamp(this.timestamp.toEXIFString()))!='' ) {
	  common.log(1,"Cannot set EXIF timestamps of '"+this.path+" to '"+this.timestamp.toEXIFString()+"' ("+result+")");
	}
      }
    }
    else {
      common.log(4,"File '"+this.path+" matches its EXIF tags");
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
	default_answer = common.get_answer(
	  "File '"+this.path+"' needs to be moved to '"+proposed_path+"'. Do it?",
	  default_answer);
	if( default_answer.toLowerCase()=='y' ) {
	  if( (result=this.move_to(proposed_path))!='' ) {
	    common.log(1,"Cannot move '"+this.path+" to '"+proposed_path+"' ("+result+")");
	  }
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
  getImages( images, callback ) {
    common.log(2,"Getting images of folder '"+this.path+"'");
    if( (this.folders==undefined) || (this.files==undefined) ) {
      this.read_file_system();
    }
    let self = this;
    async.eachLimit(
      self.folders,
      1, // all the parallelism happens on files
      ( f, callback ) => {
	f.getImages(images,callback);
      },
      ( err ) => {
	if( err ) {
	  callback(err,images);
	}
	else {
	  async.eachLimit(
	    self.files,
	    os.cpus().length,
	    ( f, callback ) => {
	      common.log(3,"reading EXIF info of file '"+f.path+"'");
	      f.read_exif_info( (err,whatever) => {
		if( !err ) {
		  images.add(f.id,f);
		}
		callback(err,images);
	      });
	    },
	    ( err ) => {
	      callback(err,images);
	    }
	  );
	}
      }
    );
  }
}
/////////////////////////////////////////////////////////////////
// 
/////////////////////////////////////////////////////////////////
module.exports = {
  'ImageFolder' : ImageFolder,
  'ImageFile'   : ImageFile
};
