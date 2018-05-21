'use strict'

const fs          = require('fs');
const querystring = require('querystring');
const request     = require('request');
const googleAuth  = require('google-auth-library');
const google      = require('googleapis');

const common          = require('./common');
const BunchOfPromises = require('./BunchOfPromises');

const _CLIENT_SECRETS_PATH  = './client_secret.json';
const _CREDENTIALS_DIR      = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials';

const GOOGLE_AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/auth';
const GOOGLE_API_HOST       = 'https://www.googleapis.com';
const GOOGLE_API_PATH       = '/oauth2/v3/token';
const GPHOTOS_SCOPE         = 'https://www.googleapis.com/auth/photoslibrary.readonly';

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class ReadContext {
    constructor( storage ) {
        this.storage = storage;
        this.pages  = new BunchOfPromises();
        this.pages.add(new Promise( (resolve,reject) => {
            this.last_page_resolve = resolve;
        }));
        this.titles = new BunchOfPromises();
    }
    toString() {
        return "pages={"+this.pages+"},titles={"+this.titles+"}";
    }
}
class GPhotos {  
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
    get_mediaitem_title_promise( context, mediaItem ) {
        const content_disposition = 'content-disposition';
        const cd_re               = /^(?:.*;)?filename=(['"])([^'"]+)\1.*$/i;
        return new Promise( (resolve,reject) => {
            let headOptions = {
                'url'    : mediaItem.baseUrl+"=w1-h1",
                'method' : 'HEAD',
                'headers': {"Connection": "keep-alive"}
            };
            request(headOptions,(err,response,body) => {
                if( err ) {
                    mediaItem.retryCount = (mediaItem.retryCount||0)+1;
                    if( mediaItem.retryCount<3 ) {
                        common.log(1,"Got error '"+err+" on a media item, retry count is "+mediaItem.retryCount+", retrying...");
                        context.titles.add(this.get_mediaitem_title_promise(context,mediaItem));
                        context.titles.resolve(resolve);
                    }
                    else {
                        context.titles.reject(reject,Error("Cannot get head ("+err+")"));
                    }
                }
                else if( response.headers.hasOwnProperty(content_disposition) ) {
                    let matches = response.headers[content_disposition].match(cd_re);
                    if( matches ) {
                        mediaItem.timestamp  = mediaItem.mediaMetadata.creationTime;
                        mediaItem.title      = matches[2];
                        // Remove some of the items that are not necessary for synchronization
                        delete mediaItem.retryCount;
                        delete mediaItem.mediaMetadata.creationTime;
                        delete mediaItem.baseUrl;
                        delete mediaItem.productUrl;
                        context.storage.add(mediaItem.id,mediaItem);
                        common.log(3,"Context="+context+",loaded a title '"+mediaItem.title+"'");
                        context.titles.resolve(resolve);
                    }
                    else {
                        context.titles.reject(reject,Error(content_disposition+" did not match regular expression"+re));
                    }
                }
                else {
                    context.titles.reject(reject,Error("Response headers did not have "+content_disposition));
                }
            });
        });
    }
    get_page_promise( context, pageToken ) {
        return new Promise( (resolve,reject) => {
            const accessTokenParams = {
                'access_token' : this.credentials.access_token
            };
            const requestQuery   = querystring.stringify(accessTokenParams);
            const body           = {'pageSize':100};
            if( pageToken ) {
                body['pageToken'] = pageToken;
            }
            const requestOptions = {
                'url'    : 'https://photoslibrary.googleapis.com/v1/mediaItems:search?'+requestQuery,
                'headers': {"Connection": "keep-alive"},
                'json'   : true,
                'body'   : body
            };
            request.post(requestOptions,(err,response,body) => {
                if( err ) {
                    context.pages.reject(reject,err);
                }
                else if( body.error ) {
                    context.pages.reject(reject,Error(body.error.message));
                }
                else {
                    // Once Google fixes https://issuetracker.google.com/issues/79656863 the following statement will no longer be necessary
                    body.mediaItems.forEach( mi => {
                        context.titles.add(this.get_mediaitem_title_promise(context,mi));
                    });
                    common.log(1,"Context="+context+",loaded "+body.mediaItems.length+" media items");
                    if( body.nextPageToken ) {
                        context.pages.add(this.get_page_promise(context,body.nextPageToken));
                    }
                    else {
                        common.log(1,"Resolving the last page promise");
                        context.last_page_resolve();
                    }
                    context.pages.resolve(resolve,undefined);
                }
            });
        });
    }
    login() {
        if( this.credentials )
            return Promise.resolve(this);
        let credentials = JSON.parse(fs.readFileSync(_CLIENT_SECRETS_PATH));
        return this.get_oauth_client(credentials,GPHOTOS_SCOPE,_CREDENTIALS_DIR+"/gphotos.json").then( (result) => {
            common.log(1,"Successfully logged to GPhotos");
            this.credentials = result.credentials;
            return this;
        });
    }
    getAlbums( albums ) {
        return this.login().then( () => {
            return new Promise( (resolve,reject) => {
                const accessTokenParams = {
                    'access_token' : this.credentials.access_token
                };
                const requestQuery   = querystring.stringify(accessTokenParams);
                const requestOptions = {
                    'url'  : 'https://photoslibrary.googleapis.com/v1/albums?'+requestQuery,
                    'json' : true
                };
                request.get(requestOptions,(err,response,body) => {
                    if( err ) {
                        reject(err);
                    }
                    else if( body.hasOwnProperty('albums') ) {
                        resolve(body.albums);
                    }
                    else {
                        reject(Error("Body does not have 'albums'"));
                    }
                });
            });
        });
    }
    read( storage ) {
        // Reading photos is not trivial. 
        // 
        // We have an unknown number of promises to resolve because the promise to load a page 'mediaItem::search' can produce
        // more pages to load and promises to resolve. Ultimately to resolve all these page promises we have to run code like:
        //     Promise.all(array_of_page_promises);
        //     array_of_page_promises.push(next_page_promise);
        // However this does  not really work because Promise.all() will return a promise to resolve the last pending item and 
        // this item might load more media result pages and add more pages/promises to array_of_page_promises
        //
        // The solution was to create a "last page" promise and stick it as an item into the same array array_of_page_promises.
        // This promise gets resolved only when the media returns a page without nextPageToken. This means that there are no
        // more media pages to load and Promise.all(array_of_page_promises) can return to finish loading titles of the media 
        // items. Creating such a "last page" promise happens inside of ReadContext constructor.
        //
        // Separately, as pages are loaded, the code creates (due to https://issuetracker.google.com/issues/79656863) promises 
        // to load titles of the media items. These are put into ReadContext.titles promises and the code waits on all
        // these title promises before resolving the main "get photos" promise.
        return this.login().then( () => {
            let context = new ReadContext(storage);
            context.pages.add(this.get_page_promise(context));
            return Promise.all(context.pages.promises).then( () => {
                common.log(1,"All pages have been loaded ("+context+")");
                return Promise.all(context.titles.promises);
            }).catch( (err) => {
                common.log(1,"There was an error loading pages ("+err+")");
                throw err;
            });
        }).then( () => {
            return storage;
        });
    }
}
module.exports = GPhotos; 
