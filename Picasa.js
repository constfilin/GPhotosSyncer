'use strict'

const fs          = require('fs');
const querystring = require('querystring');
const request     = require('request');
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
function _is_valid_type(value) {
    return typeof value === 'string' || typeof value === 'number';
}
function _check_param (param) {
    if (param === undefined) return '';
    else if (_is_valid_type(param)) return param;
    else if (_is_valid_type(param['$t'])) return param['$t'];
    else return param;
}
function _parse_entry( entry, schema ) {
    let photo = {};
    for( let schemaKey in schema ) {
        const schemaValue = schema[schemaKey];
        const paramValue  = _check_param(entry[schemaKey]);
        try {
            photo[schemaValue[0]] = (schemaValue.length>1) ? schemaValue[1](paramValue) : paramValue;
        }
        catch( err ) {
            photo[schemaValue[0]] = err;
        }
    }
    return photo;
}
/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class PicasaAlbumPhotosQuery {
    constructor( access_token, album, photos, query ) {
        // fixed context
        this.access_token       = access_token;
        this.album              = album;
        this.photos             = photos;
        this.query              = (query && query.length>0) ? query : undefined;
        this.max_number_of_503s = 5;
        // changing context
        this.number_of_503s     = 0;
        this.gotten_photos_cnt  = 0;
        // start with a single promise that gets photos from 1 to 1000 max
        this.promises           = [this.get_promise(1,1000)]; 
    }
    get_promise( start_index, max_results ) {
        return new Promise( (resolve,reject) => {
            common.log(1,"Getting photos "+(this.query?" by query '"+this.query+"' ":"")+"of album '"+this.album.title+"' ("+this.album.num_photos+" photos), start_index="+start_index+"max_results="+max_results);
            const accessTokenParams = {
                'alt'          : 'json',
                'kind'         : 'photo',
                'access_token' : this.access_token,
                'start-index'  : start_index,
                'max-results'  : max_results
            };
            if( this.query ) {
                accessTokenParams['q'] = this.query;
            }
            const requestQuery = querystring.stringify(accessTokenParams);
            const requestOptions = {
                url : 'https://picasaweb.google.com/data'+PICASA_API_FEED_PATH+'/albumid/'+this.album.id+'?'+requestQuery,
                headers: {
                    'GData-Version': '2'
                }
            };
            common.log(1,"Sending request "+JSON.stringify(requestOptions));
            request.get(requestOptions,(err,response,body) => {
                if( err ) {
                    // TODO: automatically handle refresh of access_token is the old one has expired
                    common.log(1,"Got error with "+JSON.stringify(requestOptions));
                    reject(err);
                }
                else if( (response.statusCode==400) && (response.body=='Invalid request') && (accessTokenParams['start-index']>2000) ) {
                    if( max_results>1 ) {
                        // Picasa does not let read much past around 11k photos returning HTTP 400. But what happens if we start
                        // reducing the number of results, perhaps it will let us advanse past the 11k limit?
                        // (NOTE: I have never seen it helping)
                        common.log(1,"Halving the number of max results to "+max_results+" for query '"+this.query+"',start_index="+start_index);
                        this.promises.push(this.get_promise(start_index,Math.floor(max_results/2)));
                    }
                    else {
                        if( this.gotten_photos_cnt<this.album.num_photos ) {
                            common.log(1,"After all retries we got only "+this.gotten_photos_cnt+" photos out of "+this.album.num_photos+" in album '"+this.album.title+"' possible :(");
                        }
                    }
                    // as far as this particular promise goes, it is resolved, there is nothing we can do futher
                    resolve(this);
                }
                else if( (response.statusCode<200) || (response.statusCode>226) ) {
                    if( (response.statusCode==503) && (response.body.toLowerCase().indexOf("try again later")>=0) ) {
                        if( ++this.number_of_503s<this.max_number_of_503s ) {
                            common.log(1,"Got 'retry later' error, total number of 503s="+this.number_of_503s);
                            this.promises.push(this.get_promise(start_index,max_results));
                            resolve(this);
                        }
                        else {
                            reject(Error("Got "+this.number_of_503s+" 'retry later' errors, bailing out"));
                        }
                    }
                    else {
                        reject(Error("Got response code "+response.statusCode+",response body "+response.body));
                    }
                }
                else if (body.length < 1) {
                    reject(Error("Body length is too short"));
                }
                else {
                    const feed        = JSON.parse(body).feed;
                    const page_result = feed.entry;
                    if( !page_result ) {
                        let num_photos = _check_param(feed['gphoto$numphotos']);
                        if( num_photos>0 ) {
                            common.log(1,"No Entry in album '"+_check_param(feed['title'])+"' for query '"+this.query+"' although it has "+num_photos+" photos");
                        }
                    }
                    else {
                        let unseen_images = page_result.reduce( (accumulator,e) => {
                            // Experiments show that the same image can have different IDs in the different albums
                            // For this we do away with Picasa ID and instead build own ID
                            let photo = _parse_entry(e,_PHOTO_SCHEMA);
                            photo.id  = (photo.timestamp.valueOf()+"_"+photo.title).toLowerCase();
                            return accumulator+(this.photos.add(photo.id,photo)?1:0);
                        },0);
                        common.log(3,"Got "+page_result.length+" photos "+(this.query?"for query '"+this.query+"' ":"")+"in album '"+this.album.title+"', of those "+unseen_images+" are unseen, start_index="+start_index);
                        this.gotten_photos_cnt += unseen_images;
                        if( page_result.length>=max_results ) {
                            // this means that we gotten all the results we asked for. Keep trying until there are no more results
                            this.promises.push(this.get_promise(start_index+page_result.length,max_results));
                        }
                    }
                    resolve(this);
                }
            });
        });
    }
};
class Picasa {  
    get_oauth_client( credentials, scopes, credentials_storage_path ) {
        return new Promise( (resolve,reject) => {
            let auth   = new googleAuth();
            let result = new auth.OAuth2(credentials.installed.client_id,credentials.installed.client_secret,credentials.installed.redirect_uris[0]);
            try {
                result.credentials = JSON.parse(fs.readFileSync(credentials_storage_path));
                return resolve(result);
            }
            catch( err ) {
                common.log(2,"Cannot read stored token from '%s' ("+err+"), re-creating it",credentials_storage_path);
                let authUrl = result.generateAuthUrl({access_type:'offline',scope:scopes});
                let code    = common.get_answer('Authorize this app by visiting url '+authUrl+'\nEnter the code from that page here');
                result.getToken(code,(err,token) => {
                    if( err ) {
                        return reject(err);
                    }
                    else {
                        result.credentials = token;
                        try {
                            common.log(1,"writing '"+JSON.stringify(token)+"' to '"+credentials_storage_path+"'");
                            fs.writeFileSync(credentials_storage_path,JSON.stringify(result.credentials));
                            return resolve(result);
                        }
                        catch( err ) {
                            return reject(Error("Cannot store token in '"+credentials_storage_path+"' ("+err+")"));
                        }
                    }
                });
            }
        });
    }
    login() {
        let credentials = JSON.parse(fs.readFileSync(_CLIENT_SECRETS_PATH));
        let self = this;
        return this.get_oauth_client(credentials,PICASA_SCOPE,_CREDENTIALS_DIR+"/picasa.json").then( (result) => {
            self.credentials = result.credentials;
            return self;
        });
    }
    getAlbums() {
        return new Promise( (resolve,reject) => { 
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
                if( err )
                    return reject(err);
                if (response.statusCode < 200 || response.statusCode > 226 )
                    return reject(Error("Got response code "+response.statusCode+",response body "+response.body));
                if (body.length < 1)
                    return reject(Error("Body length is too short"));
                const feed   = JSON.parse(body).feed;
                const albums = feed.entry.map(
                    entry => _parse_entry(entry,_ALBUM_SCHEMA)
                );
                return resolve(albums);
            });
        });
    }
    get_album_photos_by_query( album, photos, query ) {
        return Promise.all((new PicasaAlbumPhotosQuery(this.credentials.access_token,album,photos,query)).promises);
    }
    get_album_photos( album, photos ) {
        if( album.num_photos<=0 ) {
            return Promise.resolve(photos);
        }
        else if( album.num_photos<10000 ) {
            return this.get_album_photos_by_query(album,photos);
        }
        else {
            common.log(2,"there are "+album.num_photos+" photos in album '"+album.title+"', trying to get the photos by subqueries");
            return Promise.resolve(photos); // do not work with too large albums

            // This album has more than 10000 photos and Picasa API has a problems with retrieving
            // those photos that are after 10000. For this we "query" the ablum in an attempts to 
            // the large volume of photos into small pieces each one is less than 10000
            const queries = [undefined,"IMG","January","February","March","April","May","June","July","August","September","October","November","December","Undated","Screenshot","Image"];
            for( let year=1900; year<=(new Date()).getFullYear(); year++ ) {
                queries.push(String(year));
            }
            // now run each of the queries
            return Promise.all(queries.map( query => this.get_album_photos_by_query(album,photos,query).catch( (err) => {
                throw Error("Error in running query '"+query+"' ("+err+")");
            })));
        }
    }
    getPhotos( photos ) {
        return this.getAlbums().then( (albums) => {
            return Promise.all(albums.map(a => this.get_album_photos(a,photos)));
        });
    }
}
module.exports = Picasa; 
