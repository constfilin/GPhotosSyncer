'use strict';

/////////////////////////////////////////////////////////////////
// module variables
/////////////////////////////////////////////////////////////////
const fs           = require('fs');
const googleAuth   = require('google-auth-library');
const sleep        = require('sleep');
const deasync      = require('deasync');
const async        = require('async');
const google       = require('googleapis');
const common       = require('./common');

const _CLIENT_SECRETS_PATH  = './client_secret.json';
const _CREDENTIALS_DIR      = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials';

/////////////////////////////////////////////////////////////////
// GPhotoFile
/////////////////////////////////////////////////////////////////
class GPhotoFile {
  constructor( gfile ) {
    this.gfile = gfile;
  }
  get name() {
    return this.gfile.name.toLowerCase();
  }
  toString() {
    return this.gfile.name; //JSON.stringify(this.gfile);
  }
  compare( imageFile ) {
    // TODO
    return "";
  }
  rename( name_ ) {
    try {
      let drive  = google.drive('v3');
      let params  = {
	auth       : module.exports.gphotos.rw_oauth2Client,
	spaces     : 'photos',
	fileId     : this.gfile.id,
	resource   : {
	  name : name_
	},
      };
      let result = deasync(drive.files.update)(params);
      common.log(4,"result of renaming of "+this.name+" to "+name_+" is "+result);
      this.gfile.name = result.name;
      return "";
    }
    catch( err ) {
      if( err.toString().indexOf("Error: The user has not granted the app")!=0 )
	return err.toString();
      return "The file has not been shared with the app. You either shares this file with our app or just rename it yourself";
    }
  }
  static create( imageFile ) {
    return "!";
  }
}
/////////////////////////////////////////////////////////////////
// GPhotos
/////////////////////////////////////////////////////////////////
class GPhotos {
  constructor() {
    this.ro_oauth2Client = undefined;
    this.rw_oauth2Client = undefined;
  }
  get_oAuth2_Credentials( credentials, scopes_, credentials_storage_path ) {
    try {
      // Authorize a client with the loaded credentials, then call the Drive API.
      let auth   = new googleAuth();
      let result = new auth.OAuth2(credentials.installed.client_id,credentials.installed.client_secret,credentials.installed.redirect_uris[0]);
      try {
	// Check if we have previously stored a token.
	result.credentials = JSON.parse(fs.readFileSync(credentials_storage_path));
      }
      catch( err ) {
	common.log(2,"Cannot read stored token from '%s' (%j), re-creating it",credentials_storage_path,err);
	let authUrl = result.generateAuthUrl({access_type:'offline',scope:scopes_});
	let code    = common.get_answer('Authorize this app by visiting url '+authUrl+'\nEnter the code from that page here');
	try {
	  let done = false;
	  result.getToken(code,function( err, token ) {
	    if( err )
	      throw err;
	    result.credentials = token;
	    done = true;
	  });
	  deasync.loopWhile(function() { return !done; });
	  try {
	    fs.writeFileSync(credentials_storage_path,JSON.stringify(result.credentials));
	    common.log(4,'Token stored to ' + credentials_storage_path);
	  }
	  catch( err ) {
	    throw Error('Error while trying to save access token to '+credentials_storage_path+' ('+err+')');
	  }
	}
	catch( err ) {
	  throw Error('Error while trying to retrieve access token ('+err+')');
	}
      }
      return result;
    }
    catch( err ) {
      throw Error("Exception of Google OAuth ("+err+")");
    }
  }
  login( callback ) {
    let credentials = JSON.parse(fs.readFileSync(_CLIENT_SECRETS_PATH));
    let ro_scopes   = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.photos.readonly',
    ];
    this.ro_oauth2Client = this.get_oAuth2_Credentials(credentials,ro_scopes,_CREDENTIALS_DIR+"/ro_gphotossyncer_google_drive.json");
    let rw_scopes   = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/drive.appfolder',
      'https://www.googleapis.com/auth/drive.metadata',
      'https://www.googleapis.com/auth/drive.scripts',
    ];
    this.rw_oauth2Client = this.get_oAuth2_Credentials(credentials,rw_scopes,_CREDENTIALS_DIR+"/rw_gphotossyncer_google_drive.json");
    callback(null,this);
  }
  read( prefix, callback ) {
    return callback(Error("Reading from GPhotos not working for easons explained in https://kunnas.com/google-photos-is-a-disaster/"),null);
    let drive    = google.drive('v3');
    let listargs = {
      auth      : this.ro_oauth2Client,
      pageSize  : 100,
      corpora   : 'user',
      spaces    : 'photos',
      fields    : "nextPageToken, files(id, name, createdTime, size, capabilities, permissions, imageMediaMetadata)",
      q         : "trashed=false"+((prefix && prefix!='')?" and name contains '"+prefix+"'":""),
      orderBy   : 'createdTime desc'
    };
    let pages             = 0;
    let rate_limit_errors = 0;
    let result            = [];
    async.whilst(
      function() {
	return listargs.pageSize>0;
      },
      function( callback ) {
	drive.files.list(listargs,function( err, response ) {
	  if( err ) {
	    if( err.toString()=='Error: User Rate Limit Exceeded' ) {
	      if( ++rate_limit_errors<2 ) {
		common.log(0,'Got a rate limit error ('+err.toString()+'), trying to recover by waiting');
		sleep.sleep(10);
		err = null; // suppress the error and try reading again
	      }
	    }
	    else {
	      err = new Error("Exception from drive.files.list ("+err+")");
	    }
	  }
	  else {
	    response.files.forEach( (gfile) => {
	      result.push(new GPhotoFile(gfile));
	    });
	    if( response.nextPageToken!=undefined ) {
	      listargs.pageToken = response.nextPageToken;
	    }
	    else {
	      common.log(3,"Read "+result.length+" google photos with prefix='"+prefix+"'");
	      listargs.pageSize = 0; // This is our signal to get out of the loop (and a sanity check)
	    }
	  }
	  callback(err,null);
	});
      },
      function( err, whatever ) {
	callback(err,result);
      }
    );
  }
  static hash_files_by_timestamp( gphoto_files ) {
    let propertyName = 'originalFilename';
    let result = {};
    gphoto_files.forEach( (gphotofile) => {
      let gfile = gphotofile.gfile;
      let ndx  = (gfile.hasOwnProperty('imageMediaMetadata') && gfile.imageMediaMetadata.time) ?
	  (common.EXIFDate.fromEXIFString(gfile.imageMediaMetadata.time).valueOf()/1000) :
	  (gfile.createdTime ? (new Date(gfile.createdTime)).valueOf()/1000 : 0)
      if( !result.hasOwnProperty(ndx) ) {
	result[ndx] = [];
      }
      result[ndx].push(gphotofile);
    });
    return result;
  }
}
/////////////////////////////////////////////////////////////////
// module exports
/////////////////////////////////////////////////////////////////
module.exports = {
  'GPhotos'    : GPhotos,
  'GPhotoFile' : GPhotoFile,
  'gphotos'    : (new GPhotos()),
}
