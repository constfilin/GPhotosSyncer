'use strict'

const fs          = require('fs');
const querystring = require('querystring');
const request     = require('request');
const async       = require('async');
const googleAuth  = require('google-auth-library');
const google      = require('googleapis');

const common      = require('./common');

const _CLIENT_SECRETS_PATH  = './client_secret.json';
const _CREDENTIALS_DIR      = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials';

const GOOGLE_AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/auth';
const GOOGLE_API_HOST       = 'https://www.googleapis.com';
const GOOGLE_API_PATH       = '/oauth2/v3/token';
const PICASA_SCOPE          = 'https://picasaweb.google.com/data';
const PICASA_API_FEED_PATH  = '/feed/api/user/default';
const PICASA_API_ENTRY_PATH = '/entry/api/user/default';

const _ALBUM_SCHEMA = {
  'gphoto$id'                : ['id'],
  'gphoto$name'              : ['name'],
  'gphoto$numphotos'         : ['num_photos',(v)=>{return Number(v);}],
  'published'                : ['published'],
  'title'                    : ['title'],
  'summary'                  : ['summary'],
  'gphoto$location'          : ['location'],
  'gphoto$nickname'          : ['nickname']
};
const _PHOTO_SCHEMA = {
  'gphoto$id'                : ['id'],
  'gphoto$albumid'           : ['album_id'],
  'gphoto$access'            : ['access'],
  'gphoto$width'             : ['width',(v)=>{return Number(v);}],
  'gphoto$height'            : ['height',(v)=>{return Number(v);}],
  'gphoto$size'              : ['size',(v)=>{return Number(v);}],
  'gphoto$checksum'          : ['checksum'],
  'gphoto$timestamp'         : ['timestamp',(v)=>{return new Date(Number(v));}],
  'gphoto$imageVersion'      : ['image_version',(v)=>{return Number(v);}],
  'gphoto$commentingEnabled' : ['commenting_enabled'],
  'gphoto$commentCount'      : ['comment_count',(v)=>{return Number(v);}],
  'content'                  : ['content'],
  'title'                    : ['title'],
  'summary'                  : ['summary']
};
/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class Picasa {  
  static _is_valid_type(value) {
    return typeof value === 'string' || typeof value === 'number';
  }
  static _check_param (param) {
    if (param === undefined) return '';
    else if (this._is_valid_type(param)) return param;
    else if (this._is_valid_type(param['$t'])) return param['$t'];
    else return param;
  }
  static _parse_entry( entry, schema ) {
    let photo = {};
    for( let schemaKey in schema ) {
      const schemaValue = schema[schemaKey];
      const paramValue  = this._check_param(entry[schemaKey]);
      try {
	photo[schemaValue[0]] = (schemaValue.length>1) ? schemaValue[1](paramValue) : paramValue;
      }
      catch( err ) {
	photo[schemaValue[0]] = err;
      }
    }
    return photo;
  }
  get_oauth_client( credentials, scopes, credentials_storage_path, callback ) {
    try {
      let auth = new googleAuth();
      let result = new auth.OAuth2(credentials.installed.client_id,credentials.installed.client_secret,credentials.installed.redirect_uris[0]);
      try {
	// +"" is critical or else access_token is a *Buffer*
	result.credentials = JSON.parse(fs.readFileSync(credentials_storage_path));
	callback(null,result);
      }
      catch( err ) {
	common.log(2,"Cannot read stored token from '%s' ("+err+"), re-creating it",credentials_storage_path);
	let authUrl = result.generateAuthUrl({access_type:'offline',scope:scopes});
	let code    = common.get_answer('Authorize this app by visiting url '+authUrl+'\nEnter the code from that page here');
	result.getToken(code,(err,token) => {
	  if( err ) {
	    callback(err,result);
	  }
	  else {
	    result.credentials = token;
	    try {
	      console.log("writing '"+JSON.stringify(token)+"' to '"+credentials_storage_path+"'");
	      fs.writeFileSync(credentials_storage_path,JSON.stringify(result.credentials));
	      callback(null,result);
	    }
	    catch( err ) {
	      callback(Error("Cannot store token in '"+credentials_storage_path+"' ("+err+")"));
	    }
	  }
	});
      }
    }
    catch( err ) {
      callback(Error("Exception of Google OAuth ("+err+")"));
    }
  }
  login( callback ) {
    let credentials = JSON.parse(fs.readFileSync(_CLIENT_SECRETS_PATH));
    let self = this;
    this.get_oauth_client(credentials,PICASA_SCOPE,_CREDENTIALS_DIR+"/picasa.json",(err,result)=> {
      if( err ) {
	callback(err,this);
      }
      else {
	self.credentials = result.credentials;
	callback(err,this);
      }
    });
  }
  getAlbums( callback ) {
    const accessTokenParams = {
      'alt'          : 'json',
      'access_token' : this.credentials.access_token
    };
    const requestQuery   = querystring.stringify(accessTokenParams);
    const requestOptions = {
      url : `${PICASA_SCOPE}${PICASA_API_FEED_PATH}?${requestQuery}`,
      headers: {
	'GData-Version': '2'
      }
    };
    request.get(requestOptions,(err,response,body) => {
      if( err ) {
	callback(err);
      }
      else if (response.statusCode < 200 || response.statusCode > 226 ) {
	callback(Error("Got response code "+response.statusCode+",response body "+response.body));
      }
      else if (body.length < 1) {
	callback(Error("Body length is too short"));
      }
      else {
	const feed = JSON.parse(body).feed;
	const albums = feed.entry.map(
	  entry => this.constructor._parse_entry(entry,_ALBUM_SCHEMA)
	);
	callback(null,albums);
      }
    });
  }
  get_photos_by_query( album, query, photos, callback ) {
    common.log(1,"Getting photos by query '"+(query?query:'n/a')+"' of album '"+album.title+"'");
    let all_pages_are_loaded = false;
    let start_index          = 1;
    let max_results          = 1000;
    let max_number_of_503s   = 5;
    let number_of_503s       = 0;
    let self                 = this;
    async.whilst(
      () => {
	return !all_pages_are_loaded;
      },
      (callback) => {
	const accessTokenParams = {
	  'alt'          : 'json',
	  'kind'         : 'photo',
	  'access_token' : self.credentials.access_token,
	  'start-index'  : start_index,
	  'max-results'  : max_results
	};
	if( query && query.length>0 ) {
	  accessTokenParams['q'] = query;
	}
	const requestQuery = querystring.stringify(accessTokenParams);
	const requestOptions = {
	  url : 'https://picasaweb.google.com/data'+PICASA_API_FEED_PATH+'/albumid/'+album.id+'?'+requestQuery,
	  headers: {
	    'GData-Version': '2'
	  }
	};
	request.get(requestOptions,(err,response,body) => {
	  if( err ) {
	    // TODO: automatically handle refresh of access_token is the old one has expired
	    common.log(1,"Got error with "+JSON.stringify(requestOptions));
	    callback(err,photos);
	  }
	  else if( (response.statusCode==400) && (response.body=='Invalid request') && (accessTokenParams['start-index']>2000) ) {
	    if( accessTokenParams['max-results']>1 ) {
	      // Picasa does not let read much past around 11k photos returning HTTP 400. But what happens if we start
	      // reducing the number of results, perhaps it will get us past the 11k limit a little bit further?
	      // (NOTE: I have never seen it helping)
	      max_results = Math.floor(max_results/2);
	      common.log(1,"Halving the number of max results to "+max_results+" for query '"+query+"',start_index="+start_index);
	      callback(null,photos);
	    }
	    else {
	      if( photos.size<album.num_photos ) {
		common.log(1,"After all retries we got only "+photos.size+" photos out of "+album.num_photos+" in album '"+album.title+"' possible :(");
	      }
	      all_pages_are_loaded = true;
	      callback(null,photos);
	    }
	  }
	  else if( (response.statusCode<200) || (response.statusCode>226) ) {
	    if( (response.statusCode=503) && (response.body.toLowerCase().indexOf("try again later")>=0) ) {
	      if( ++number_of_503s<max_number_of_503s ) {
		common.log(1,"Got 'retry later' error, total number of 503s="+number_of_503s);
		callback(null,photos);
	      }
	      else {
		callback(Error("Got "+number_of_503s+" 'retry later' errors, bailing out"));
	      }
	    }
	    else {
	      callback(Error("Got response code "+response.statusCode+",response body "+response.body));
	    }
	  }
	  else if (body.length < 1) {
	    callback(Error("Body length is too short"));
	  }
	  else {
	    const feed        = JSON.parse(body).feed;
	    const page_result = feed.entry;
	    if( !page_result ) {
	      let num_photos = self.constructor._check_param(feed['gphoto$numphotos']);
	      if( num_photos>0 ) {
		common.log(1,"No Entry in album '"+self.constructor._check_param(feed['title'])+"' although it has "+num_photos+" photos, feed="+JSON.stringify(feed));
	      }
	      all_pages_are_loaded = true;
	    }
	    else {
	      let unseen_images = page_result.reduce( (accumulator,e) => {
		// Experiments show that the same image can have different IDs in the different albums
		// For this we do away with Picasa ID and instead build own ID
		let photo = self.constructor._parse_entry(e,_PHOTO_SCHEMA);
		photo.id  = (photo.timestamp.valueOf()+"_"+photo.title).toLowerCase();
		return accumulator+(photos.add(photo.id,photo)?1:0);
	      },0);
	      common.log(3,"Got "+page_result.length+" photos for query '"+query+"' in album '"+album.title+"', of those "+unseen_images+" are unseen, start_index="+start_index);
	      start_index += page_result.length;
	      all_pages_are_loaded = page_result.length<accessTokenParams['max-results'];
	    }
	    callback(err,photos);
	  }
	});
      },
      ( err, results ) => {
	callback(err,results);
      }
    );
  }  
  getPhotos( album, photos, callback ) {
    if( album.num_photos<10000 ) {
      this.get_photos_by_query(album,undefined,photos,callback);
    }
    else {
      common.log(2,"there are "+album.num_photos+" photos in album '"+album.title+"', trying to get the photos by subqueries");
      // This album has more than 10000 photos and Picasa API has a problems with retrieving
      // those photos that are after 10000. For this we "query" the ablum in an attempts to 
      // the large volume of photos into small pieces each one is less than 10000
      const queries = [undefined,"IMG","January","February","March","April","May","June","July","August","September","October","November","December","Undated","Screenshot","Image"];
      for( let year=1900; year<=(new Date()).getFullYear(); year++ ) {
	queries.push(String(year));
      }
      // now run each of the queries
      let self = this;
      async.each(
	queries,
	( query, callback ) => {
          self.get_photos_by_query(album,query,photos,callback);
	},
	( err ) => {
          if( err ) {
            callback(Error("Error in running queries ("+err+")"),photos);
          }
          else {
            callback(null,photos);
          }
	}
      );
    }
  }
}
module.exports = Picasa; 
