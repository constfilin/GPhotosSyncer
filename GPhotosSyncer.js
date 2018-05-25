#!/usr/bin/nodejs

"use strict";

const fs     = require('fs');

const common  = require('./common');
const Storage = require('./Storage');
const GPhotos = require('./GPhotos');
const Images  = require('./Images');

class Action {
    constructor( name, description, needs_images, needs_gphotos, proc ) {
        this.name          = name;
        this.name_parts    = name.split("=");
        this.description   = description;
        this.needs_images  = needs_images;
        this.needs_gphotos = needs_gphotos;
        this.proc          = proc;
    }
    async call( imagesPromise, gphotosPromise, arg ) {
        let year = Number(arg);
        return (this.proc.bind(this))(await imagesPromise,await gphotosPromise,Number.isNaN(year)?arg:year);
    }
}
const _ACTIONS = [
    new Action("// Actions on gphotos"),
    new Action("gphotos_showYears","shows the number of images has for each year",false,true,function(images,gphotos) {
        let by_years = gphotos.storage.rehash(p => p.timestamp.getFullYear(),1);
        for( let year in by_years ) {
            console.log(year+": "+by_years[year].length+" gphotos");
        }
    }),
    new Action("gphotos_showYear=year","shows gphotos timestamped to given year",false,true,function(images,gphotos,year) {
        Object.values(gphotos.storage.filter(p => p.timestamp.getFullYear()==year)).forEach( p => {
            console.log(p.id+" => "+JSON.stringify(p,undefined,2));
        });
    }),
    new Action("gphotos_matchingGPath=pattern","shows gphotos with gphotos_path matching given regexp pattern",false,true,function(images,gphotos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        Object.values(gphotos.storage.filter( p => !p.gphotos_path || p.gphotos_path.match(re) )).forEach( p => {
            console.log(p.id+" => "+JSON.stringify(p,undefined,2));
        });
    }),
    new Action("gphotos_mismatchingGPath=pattern","shows gphotos with gphotos_path not matching given regexp pattern",false,true,function(images,gphotos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        Object.values(gphotos.storage.filter( p => (p.gphotos_path.match(re)==null) )).forEach( p => {
            console.log(p.gphotos_path+" => timestamp="+p.timestamp+",id="+p.id);
        });
    }),
    new Action("gphotos_mismatchingYear=year","shows gphotos timestamped to given year and with gphotos_path mismatching the year",false,true,function(images,gphotos,year) {
        let re = new RegExp("^"+year+"_.+","i");
        Object.values(gphotos.storage.filter( p => (p.timestamp.getFullYear()==year) && (p.gphotos_path.match(re)==null) )).forEach( p => {
            console.log(p.id+" => "+p.gphotos_path);
        });
    }),
    new Action("gphotos_mismatchingYears","shows all gphotos where gphotos_path mismatches the image timestamp",false,true,function(images,gphotos) {
        Object.values(gphotos.storage.filter( p => p.gphotos_path.indexOf(p.timestamp.getFullYear()+"_")!=0)).forEach( (p) => {
            console.log(p.id+" => year="+p.timestamp.getFullYear()+","+p.gphotos_path);
        });
    }),
    new Action("gphotos_minusImagesYear=year","shows gphotos that are not among images for given year",true,true,function(images,gphotos,year) {
        common.subtract_storables(
            gphotos.storage.filter(p=>(p.timestamp.getFullYear()==year)),
            images.storage.filter (i=>(i.timestamp.getFullYear()==year)),
            ( gp, closest, hours_diff, all_same_gpath ) => {
                if( hours_diff<12 )
                    return false;
                console.log("GPhoto "+gp.id+" => "+Date.toEXIFString(gp.timestamp)+" is different by "+hours_diff+" hours from image "+closest.id+" => "+Date.toEXIFString(closest.timestamp)+" ("+closest.path+")\nTry:\n"+
                            process.argv[1]+" --gphotos_updateId="+gp.id+" --images_updateId="+closest.id+"\n");
                return false;;
            }
        ).forEach( p => {
            console.log(p.id+" => "+p.timestamp+","+p.gphotos_path+", this photo DOES NOT HAVE CLOSEST IMAGE");
        });
    }),
    new Action("gphotos_count","shows the count of gphotos",false,true,function(images,gphotos) {
        console.log(gphotos.storage.size);
    }),
    new Action("gphotos_showAlbums","list the albums you have in gphotos",false,true,function(images,gphotos) {
        gphotos.getAlbums().then( (albums) => { 
            console.log(albums);
        });
    }),
    new Action("gphotos_readAlbum=albumId","update cached information all GPhotos in given album",false,true,function(images,gphotos,albumId) {
        gphotos.read(albumId).then( (gphotos) => {
            console.log(gphotos.storage);
            console.log("Re-read information about gphotos in album '"+albumId+"'");
        });
    }),
    new Action("gphotos_read","update cached information about all gphotos",false,true,function(images,gphotos) {
        gphotos.read().then( (gphotos) => {
            console.log("Re-read information about "+gphotos.storage.size+" gphotos");
        });
    }),
    new Action("gphotos_getByMediaItemId=mediaItemId","given a media item ID in GPhotos, retrieve its properties",false,true,function(images,gphotos,mediaItemIds) { 
        mediaItemIds = (mediaItemIds.constructor==String) ? [mediaItemIds] : mediaItemIds;
        mediaItemIds.forEach( mediaItemId => {
            gphotos.getByMediaItemId(mediaItemId).then( (gphoto) => {
                console.log(JSON.stringify(gphoto,undefined,2));
            });
        });
    }),
    new Action("gphotos_addByMediaItemId=mediaItemId","given a media item ID retrieve it from GPhotos and add to the cache",false,true,function(images,gphotos,mediaItemId) { 
        mediaItemIds = (mediaItemIds.constructor==String) ? [mediaItemIds] : mediaItemIds;
        mediaItemIds.forEach( mediaItemId => {
            gphotos.getByMediaItemId(mediaItemId).then( (gphoto) => {
                if( gphotos.storage.add(gphoto.id,gphoto) ) {
                    console.log("Added "+JSON.stringify(gphoto,undefined,2));
                }
                else {
                    console.log("Could not add "+JSON.stringify(gphoto,undefined,2));
                }
            });
        });
    }),
    new Action("gphotos_updateId=gphotoid","refresh information about given gphotoid in storage with information from GPhotos",false,true,function(images,gphotos,gphotoids) {
        gphotoids = (gphotoids.constructor===String) ? [gphotoids] : gphotoids;
        gphotoids.forEach( gphotoid => {
            gphotos.updateId(gphotoid).then( (item) => {
                console.log("Updated "+JSON.stringify(item,undefined,2));
	          }).catch( (err) => {
	              console.log("There was an error ("+err+")");
	          });
        });
    }),
    new Action("gphotos_removeId=gphotoid","deletes an image with given id fomr the file system",false,true,function(images,gphotos,gphotoid) {
        gphotoids = (gphotoids.constructor===String) ? [gphotoids] : gphotoids;
        gphotoids.forEach( gphotoid => {
            gphotos.removeId(gphotoid).then( (item) => {
	              console.log("Removed "+JSON.stringify(item,undefined,2));
            }).catch( (err) => {
                console.log("There was an error ("+result+")");
            });
        });
    }),
    new Action("// Actions on images (i.e. file system)"),
    new Action("images_showYears","shows the number of images for each year",true,false,function(images,gphotos) {
        let by_years = images.storage.rehash( (i) => {
            return i.timestamp.getFullYear()
        },true);
        for( let year in by_years ) {
            console.log(year+": "+by_years[year].length+" images");
        }
    }),
    new Action("images_showYear=year","shows images timestamped to given year",true,false,function(images,gphotos,year) {
        Object.values(images.storage.filter( i => i.timestamp.getFullYear()==year )).forEach( (i) => {
            console.log(i.id+" => "+JSON.stringify(i,undefined,2));
        });
    }),
    new Action("images_matchingGPath=pattern","shows images with gphotos_path matching given regexp pattern",true,false,function(images,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        Object.values(images.storage.filter( i => i.gphotos_path.match(re) )).forEach( (i) => {
            console.log(i.id+" => "+JSON.stringify(i,undefined,2));
        });
    }),
    new Action("images_mismatchingGPath=pattern","shows images with gphotos_path not matching given regexp pattern",true,false,function(images,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        Object.values(images.storage.filter( p => (p.gphotos_path.match(re)==null) )).forEach( (i) => {
            console.log(i.id+" => "+i.path);
        });
    }),
    new Action("images_mismatchingYear=year","shows images timestamped to given year and with gphotos_path mismatching the year",true,false,function(images,gphotos,year) { 
        let re   = new RegExp("^"+year+"_.+","i");
        Object.values(images.storage.filter( p => (p.timestamp.getFullYear()==year) && (p.gphotos_path.match(re)==null) )).forEach( (i) => {
            console.log(i.id+" => "+i.path);
        });
    }),
    new Action("images_mismatchingYears","shows images whose title mismatch the image timestamp",true,false,function(images,gphotos) {
        Object.values(images.storage.filter( p => p.gphotos_path.indexOf(p.timestamp.getFullYear()+"_")!=0 )).forEach( (i) => {
            console.log(i.id+" => year="+i.timestamp.getFullYear()+","+i.title);
        });
    }),
    new Action("images_minusGPhotosYear=year","shows images that are not among gphotos for given year",true,true,function(images,gphotos,year) {
        common.subtract_storables(
            images.storage.filter( i => (i.timestamp.getFullYear()==year) ),
            gphotos.storage.filter( p => (p.timestamp.getFullYear()==year) ),
            ( im, closest, hours_diff, all_same_gpath ) => {
                if( hours_diff<12 )
                    return false;
                console.log("Image "+im.id+" => "+Date.toEXIFString(im.timestamp)+" is different by "+hours_diff+" hours from gphoto "+closest.id+" => "+Date.toEXIFString(closest.timestamp)+" ("+closest.productUrl+")\nTry:\n"+
                            process.argv[1]+" --images_updateId="+im.id+" --gphotos_updateId="+closest.id+"\n");
                return false;
            }
        ).forEach( im => {
            console.log("Image "+im.id+" => "+Date.toEXIFString(im.timestamp)+","+im.path+", this image DOES NOT HAVE CLOSEST PHOTO");
        });
    }),
    new Action("images_uploadMissingGPhotosYear=year","finds all images that are not among GPhotos for a given year and uploads them to GPhotos",true,true,function(images,gphotos,year) {
        let difference = common.subtract_storables(
            images.storage.filter( i => (i.timestamp.getFullYear()==year) ),
            gphotos.storage.filter( p => (p.timestamp.getFullYear()==year) ),
            'image',
            'gphoto'
        );
        if( difference.not_found.length ) {
            if( common.get_answer("Found "+difference.not_found.length+" images that are not in gphotos:\n"+
                                  "\t"+difference.not_found.map(i => "{"+i.id+","+i.gphotos_path+"}").join("\n\t")+"\n"+
                                  "Upload them?","y")=="y" ) {
                Promises.all(difference.not_found.map(im=>gphotos.upload(im).then( (gphoto) => {
                    console.log("Image "+JSON.stringify(im,undefined,2)+" was uploaed to "+JSON.stringify(gphoto,undefined,2));
                }).catch( (err) => {
                    console.log("Count not upload image "+JSON.stringify(im,undefined,2)+" ("+err+")");
                })));
            }
        }
        if( difference.same_gphotos_path.length ) {
            if( common.get_answer("Found "+difference.same_gphotos_path.length+" cases when an image and a photo have the same gphotos_path but different timestamps:\n"+
                                  "\t"+difference.same_gphotos_path.map(e=>(e.diff+"h: "+e.image.id+","+e.gphoto.id)).join("\n\t")+"\n"+
                                  "Replace these gphotos with images?","y")=="y" ) {
                Promise.all(difference.same_gphotos_path.map( (e) => gphotos.upload(e.image).then( (gphoto) => {
                    console.log("Image "+JSON.stringify(e.image,undefined,2)+" was uploaded to "+JSON.stringify(gphoto,undefined,2));
                    return gphotos.removeId(e.gphoto.id).then( (gphoto) => {
                       console.log("GPhotos '"+JSON.stringify(gphotos,undefined,2)+" was removed");
                    }).catch( (err) => {
                       console.log("Cannot remove gphoto '"+JSON.stringify(e.gphoto.id,undefined,2)+" ("+err+")");
                    });
                }).catch( (err) => {
                    console.log("Count not upload image "+JSON.stringify(im,undefined,2)+" ("+err+")");
                })));
            }
        }
    }),
    new Action("images_checkExifTimestampsYear=year","reads images of given year and makes sure that their path location matches their EXIF timestamps",true,false,function(images,gphotos,year) {
        let changed_files = images.check_exif_timestamps(i => i.timestamp.getFullYear()==year);
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("images_checkExifTimestampsMatchingGPath=pattern","reads all images and makes sure that their path location matches their EXIF timestamps",true,false,function(images,gphotos,pattern) {
        let re = new RegExp(pattern,"i");
        let changed_files = images.check_exif_timestamps( i => i.gphotos_path.match(re) );
        common.log(1,changed_files+" file have been updated");
    }),
    new Action("images_count","shows the count of images",true,false,function(images,gphotos) {
        console.log(images.storage.size);
    }),
    new Action("images_updateYear=year","updates cached information about images of particular year",true,false,function(images,gphotos,year) {
        images.read(common.imagesRoot+"/"+year).then( (images) => {
            console.log("Updated cache information about images of year "+year);
        });
    }),
    new Action("images_read","updates cached information about all images",true,false,function(images,gphotos) {
        images.read(common.imagesRoot).then( (images) => {
            console.log("Update cache information about "+images.storage.toArray().length+" images");
        });
    }),
    new Action("images_updateId=imageid","Re-reads file system and refreshes cache for image with given ID",true,false,function(images,gphotos,imageid) {
        images.updateId(imageid).then( (item) => {
            console.log("Updated "+JSON.stringify(item,undefined,2));
        }).catch( (err) => {
            console.log("There was an error ("+err+")");
        });
    }),
    new Action("images_removeId=imageid","deletes an image with given id from the file system",true,false,function(images,gphotos,imageid) {
        images.removeId(imageid).then( (item) => {
            console.log("Removed "+JSON.stringify(item,undefined,2));
        }).catch( (err) => {
            console.log("There was an error ("+result+")");
        });
    }),
    new Action("images_uploadId=imageid","(re-)uploads an image with given id to GPhotos",true,true,function(images,gphotos,imageids) {
        imageids = (imageids.constructor==String) ? [imageids] : imageids;
        imageids.forEach( (id) => {
            let im = images.storage.get(id);
            if( im ) {
                gphotos.upload(im).then( (gphoto) => {
                    console.log("Uploaded image "+JSON.stringify(im,undefined,2)+" to gphoto "+JSON.stringify(gphoto,undefined,2));
                }).catch( (err) => {
                    console.log("Cannot upload image "+JSON.stringify(im,undefined,2)+" ("+err+")");
                });
            }
            else {
                console.log("Image id '"+id+"' is not known");
            }
        })
    }),
    new Action("// Other"),
    new Action("deltaYear=year","shows differences in objects timestamped to particular year",true,true,function(images,gphotos,year) {
        _ACTIONS.filter(a => ["images_minusGPhotosYear","gphotos_minusImagesYear"].indexOf(a.name_parts[0])>=0).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(images,gphotos,year);
        });
    }),
    new Action("showYear=year","shows objects timestamped to particular year",true,true,function(images,gphotos,year) {
        _ACTIONS.filter(a => ["images_showYear","gphotos_showYear"].indexOf(a.name_parts[0])>=0).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(images,gphotos,year);
        });
    }),
    new Action("showYears","for each year show how many images and gphotos it has",true,true,function(images,gphotos) {
        let gphotos_by_years = gphotos.storage.rehash(p => p.timestamp.getFullYear());
        let images_by_years = images.storage.rehash(i => i.timestamp.getFullYear());
        Object.keys(gphotos_by_years).reduce( (accumulator,year) => {
            if( !accumulator.includes(year) )
                accumulator.push(year);
            return accumulator;
        },Object.keys(images_by_years)).sort().forEach( year => {
            let gphotos_count = (gphotos_by_years.hasOwnProperty(year)?gphotos_by_years[year].length:0);
            let images_count = (images_by_years.hasOwnProperty(year)?images_by_years[year].length:0);
            console.log(year+": "+gphotos_count+" gphotos, "+images_count+" images"+((gphotos_count!=images_count)?" <==":""));
        });
    }),
    new Action("images_to_gphotos","enumerate all files on the file system and make sure that GPhotos has the copy",true,true,function(images,gphotos) {
        console.log(this.name_parts[0]+" is not implemented");
    }),
];
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
let valid_actions = _ACTIONS.filter( a => common.argv.hasOwnProperty(a.name_parts[0]) && a.proc );
if( valid_actions.length ) {
    let imagesPromise = valid_actions.filter(a=>a.needs_images).length ? (new Images()).read(common.imagesRoot).catch( (err) => {
        console.log("There was an error getting images ("+err+")");
    }) : undefined;
    let gphotosPromise = valid_actions.filter(a=>a.needs_gphotos).length ? (new GPhotos()).read('').catch( (err) => {
        console.log("There was an error getting photos ("+err+")");
    }) : undefined;
    valid_actions.forEach( (a) => {
        a.call(imagesPromise,gphotosPromise,common.argv[a.name_parts[0]]).catch( (err) => {
            console.log(err);
            console.log("Exception from handler of "+a.name+" ("+err+")");
        });
    });
}
else {
    console.log(
        "USAGE: "+process.argv[1]+" [--loglevel=loglevel] [--dryrun] --action --action...\n" +
            "--loglevel - defines verbosity.\n" +
            "--dryrun   - just report inconsistencies found without prompting to fix them\n"+
            "--action   - describes what we are going to do, one of:\n"+
            _ACTIONS.map( a => "    "+a.name.padEnd(40)+(a.description?" - "+a.description:"") ).join("\n")+"\n"+
            "\n"+
            "If several actions are given on the command line then all of them are executed in the given order\n"+
            "E.G.:\n"+
            "   "+process.argv[1]+" --images_minusGPhotosYear=1915 --gphotos_minusImagesYear=1915\n"+
            "Will show all the delta between images stored on file system and in GPhotos for year 1915.\n"
    );
}
