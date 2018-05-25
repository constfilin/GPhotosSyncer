'use strict'

const fs          = require('fs');
const querystring = require('querystring');
const request     = require('request');
const googleAuth  = require('google-auth-library');
const google      = require('googleapis');

const common          = require('./common');
const Storage         = require('./Storage');
const BunchOfPromises = require('./BunchOfPromises');

const _CLIENT_SECRETS_PATH  = './client_secret.json';
const _CREDENTIALS_DIR      = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials';

const GOOGLE_AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/auth';
const GOOGLE_API_HOST       = 'https://www.googleapis.com';
const GOOGLE_API_PATH       = '/oauth2/v3/token';
const GPHOTOS_SCOPE         = 'https://www.googleapis.com/auth/photoslibrary';

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class GPhoto {
    constructor( mediaItem, gphotos_path ) {
        this.timestamp    = new Date(mediaItem.mediaMetadata.creationTime);
        this.key          = mediaItem.id;
        this.productUrl   = mediaItem.productUrl;
        this.description  = mediaItem.description;
        this.mimeType     = mediaItem.mimeType;
        this.mediaMetadata= mediaItem.mediaMetadata;
        this.gphotos_path = gphotos_path;
        this.id           = String(this.timestamp.valueOf()+"_"+this.gphotos_path).toLowerCase();
    }
}
class ReadContext {
    constructor( storage, albumId ) {
        this.storage = storage;
        this.albumId = albumId;
        this.pages  = new BunchOfPromises();
        this.pages.add(new Promise( (resolve,reject) => {
            this.last_page_resolve = resolve;
        }));
        this.addgphotos = new BunchOfPromises();
    }
    toString() {
        return "pages={"+this.pages+"},addgphotos={"+this.addgphotos+"}";
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
    get_mediaitem_content_disposition_promise( mediaItem ) {
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
                    reject(err);
                }
                else if( !response.headers.hasOwnProperty(content_disposition) ) {
                    reject(Error("HEAD request didn't return "+content_disposition));
                }
                else {
                    let matches = response.headers[content_disposition].match(cd_re);
                    if( matches ) {
                        resolve(matches[2]);
                    }
                    else {
                        reject(Error(content_disposition+" did not match regular expression"+re));
                    }
                }
            });
        });
    }
    get_add_gphoto_promise( context, mediaItem ) {
        return new Promise( (resolve,reject) => {
            this.get_mediaitem_content_disposition_promise(mediaItem).then( (content_disposition) => {
                let gphoto = new GPhoto(mediaItem,content_disposition);
                context.storage.add(gphoto.id,gphoto);
                common.log(3,"Context="+context+",loaded photo '"+gphoto.gphotos_path+"'");
                context.addgphotos.resolve(resolve);
            }).catch( err => {
                mediaItem.retryCount = (mediaItem.retryCount||0)+1;
                if( mediaItem.retryCount<3 ) {
                    common.log(1,"Got error '"+err+" on a media item, retry count is "+mediaItem.retryCount+", retrying...");
                    context.addgphotos.add(this.get_add_gphoto_promise(context,mediaItem));
                    context.addgphotos.resolve(resolve);
                }
                else {
                    context.addgphotos.reject(reject,Error("Cannot get content disposition ("+err+")"));
                }
            });
        });
    }
    get_page_promise( context, pageToken ) {
        return new Promise( (resolve,reject) => {
            const body = {'pageSize':100};
            if( context.albumId ) {
                body['albumId'] = context.albumId;
            }
            if( pageToken ) {
                body['pageToken'] = pageToken;
            }
            const requestOptions = {
                'url'    : 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
                'headers': {
                    "Connection"    : "keep-alive",
                    "Authorization" : "Bearer "+this.credentials.access_token
                },
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
                        context.addgphotos.add(this.get_add_gphoto_promise(context,mi));
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
    constructor() {
        try {
            this.storage = new Storage(common.photosCache);
            this.storage_albumId = '';
            common.log(2,"Successfully restored photos from cache '"+common.photosCache+"', number of images is "+this.storage.size);
        }
        catch( err ) {
            this.storage = undefined;
        }
        process.on('exit', (code) => {
            if( this.storage && (this.storage_albumId=='') ) {
                // TODO: check if storage has changed (probably by counting an SHA hash of it)
                common.log(2,"Storing photos to '"+common.photosCache+"'");
                fs.writeFileSync(common.photosCache,JSON.stringify(this.storage.storage));
            }
        });
    }
    getAlbums( albums ) {
        return this.login().then( () => {
            return new Promise( (resolve,reject) => {
                const requestOptions = {
                    'url'     : 'https://photoslibrary.googleapis.com/v1/albums',
                    'headers' : {
                        'Authorization' : 'Bearer '+this.credentials.access_token
                    },
                    'json'    : true
                };
                request.get(requestOptions,(err,response,body) => {
                    if( err ) {
                        reject(err);
                    }
                    else if( body.error ) {
                        reject(Error(body.error.message));
                    }
                    else if( body.hasOwnProperty('albums') ) {
                        resolve(Object.map(body.albums, a=> {
                            delete a.coverPhotoBaseUrl;
                            delete a.productUrl;
                            return a;
                        }));
                    }
                    else {
                        reject(Error("Body does not have 'albums'"));
                    }
                });
            });
        });
    }
    upload( im ) {
        return this.login().then( () => {
            return new Promise( (resolve,reject) => {
                let requestOptions = {
                    'url'    : 'https://photoslibrary.googleapis.com/v1/uploads',
                    'headers': {
                        'Content-Type'           : 'application/octet-stream',
                        'Authorization'          : 'Bearer '+this.credentials.access_token,
                        'X-Goog-Upload-File-Name': im.gphotos_path  /* this does not seem to work, instead name seems to be generated from the current date, e.g. 2018-05-23.jpg */
                    },
                    'body'   : fs.readFileSync(im.path)
                };

                console.log(requestOptions.headers);

                request.post(requestOptions,(err,response,body) => {
                    if( err ) {
                        reject(Error("Cannot upload bytes ("+err+")"));
                    }
                    else {
                        let upload_token = body;
                        requestOptions = {
                            'json'    : true,
                            'url'     : 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
                            'headers' : {
                                'Content-Type'   : 'application/json',
                                'Authorization'  : 'Bearer '+this.credentials.access_token
                            },
                            body      : {
                                newMediaItems : [
                                    {
                                        'description' : im.gphotos_path.replace(/_/g,' '),
                                        'simpleMediaItem' : {
                                            'uploadToken' : upload_token
                                        }
                                    }
                                ]
                            }
                        }
                        request.post(requestOptions,(err,response,body) => {
                            if( err ) {
                                reject(Error(im.path+" on batch create => "+err));
                            }
                            else if( body.error ) {
                                reject(Error(body.error.message));
                            }
                            else if( !body.newMediaItemResults || body.newMediaItemResults.length!=1 ) {
                                reject(Error(im.path+" on batch create didn't return newMediaItemResults"));
                            }
                            else {
                                let nmir = body.newMediaItemResults[0];
                                if( nmir.status.code || nmir.status.message!="OK" ) {
                                    reject(Error(im.path+" status code is "+nmir.status.code+"("+nmir.status.message+")"));
                                }
                                else {
                                    // Photos are uploaded to GPhotos without filename (despite X-Goog-Upload-File-Name header, see above)
                                    // Therefore when we need to preserve the gphotos_path in the cache by copiyng it from the original
                                    let gphoto = new GPhoto(nmir.mediaItem,im.gphotos_path);
                                    // I have seen where description is not available immediately after download. Fill it in ourselves
                                    if( !gphoto.description )
                                        gphoto.description = im.gphotos_path.replace(/_/g,' ');
                                    this.storage.add(gphoto.id,gphoto);
                                    resolve(gphoto);
                                }
                            }
                        });
                    }
                });
            });
        });
    }
    read( albumId ) {

        albumId = albumId ? albumId : '';

        // Calling read method without specifying an argument means that we want to read ALL
        // the photos. In this case we can update everything in our storage
        if( this.storage && (albumId==this.storage_albumId) )
            return Promise.resolve(this);

        let storage = new Storage();

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
        // to load titles of the media items. These are put into ReadContext.addgphotos promises and the code waits on all
        // these addgphotos promises before resolving the main "get photos" promise.
        return this.login().then( () => {
            let context = new ReadContext(storage,albumId);
            context.pages.add(this.get_page_promise(context));
            return Promise.all(context.pages.promises).then( () => {
                common.log(1,"All pages have been loaded ("+context+")");
                return Promise.all(context.addgphotos.promises);
            }).catch( (err) => {
                common.log(1,"There was an error loading pages ("+err+")");
                throw err;
            });
        }).then( () => {
            this.storage         = storage;
            this.storage_albumId = albumId;
            return this;
        });
    }
    getByMediaItemId( mediaItemId ) {
        return this.login().then( () => {
            return new Promise( (resolve,reject) => {
                const requestOptions = {
                    'json'    : true,
                    'url'     : 'https://photoslibrary.googleapis.com/v1/mediaItems/'+mediaItemId,
                    'headers' : {
                        'Authorization' : 'Bearer '+this.credentials.access_token
                    }
                };
                request.get(requestOptions,(err,response,body) => {
                    if( err ) {
                        reject(err);
                    }
                    else if( body.error ) {
                        reject(Error(body.error.message));
                    }
                    else {
                        let mediaItem = body;
                        this.get_mediaitem_content_disposition_promise(mediaItem).then( (content_disposition) => {
                            resolve(new GPhoto(mediaItem,content_disposition));
                        }).catch( (err) => {
                            reject(Error("Cannot get content disposition ("+err+")"));
                        });
                    }
                });
            });
        });
    }
    removeId( id ) {
        let gphoto = this.storage.del(id);
        if( !gphoto )
            throw Error("id '"+id+" is not known");
        common.log(1,"Google API does not support removal of photos yet, Do it manually at "+gphoto.productUrl);
        return Promise.resolve(gphoto);
    }
    updateId( id ) {
        let gphoto = this.storage.get(id);
        if( !gphoto )
            throw Error("id '"+id+"' is not known");
        return this.getByMediaItemId(gphoto.key).then( (gphoto) => {
            this.storage.del(id);
            this.storage.add(gphoto.id,gphoto);
            return gphoto;
        });
    }
}
module.exports = GPhotos; 
