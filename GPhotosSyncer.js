#!/usr/bin/nodejs

"use strict";

const fs     = require('fs');

const common  = require('./common');
const Storage = require('./Storage');
const GPhotos = require('./Picasa');
const Images  = require('./Images');

class Action {
    constructor( name, description, needs_images, needs_photos, proc ) {
        this.name         = name;
        this.name_parts   = name.split("=");
        this.description  = description;
        this.needs_images = needs_images;
        this.needs_photos = needs_photos;
        this.proc         = proc;
    }
    async call( imagesPromise, photosPromise, n ) {
        return (this.proc.bind(this))(await imagesPromise,await photosPromise,n);
    }
}
const _ACTIONS = [
    new Action("// Actions on gphotos"),
    new Action("gphotos_showYears","shows the number of images GPhotos has for each year",false,true,function(images,photos) {
        let by_years = photos.toHash(p => p.timestamp.getFullYear(),true);
        for( let year in by_years ) {
            console.log(year+": "+by_years[year].length+" photos");
        }
    }),
    new Action("gphotos_showYear=year","shows GPhotos photos timestamped to given year",false,true,function(images,photos,year) {
        photos.filter(p => p.timestamp.getFullYear()==year).forEach( (p) => {
            console.log(p.title+" => timestamp="+p.timestamp+",id="+p.id);
        });
    }),
    new Action("gphotos_matchingTitle=pattern","shows GPhotos photos with titles matching given regexp pattern",false,true,function(images,photos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        photos.filter( p => p.title.match(re) ).forEach( (p) => {
            console.log(p.id+" => "+p.title);
        });
    }),
    new Action("gphotos_mismatchingTitle=pattern","shows GPhotos photos with titles not matching given regexp pattern",false,true,function(images,photos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        photos.filter( p => (p.title.match(re)==null) ).forEach( (p) => {
            console.log(p.id+" => "+p.title);
        });
    }),
    new Action("gphotos_mismatchingYear=year","shows GPhotos photos timestamped to given year and with title mismatching the year",false,true,function(images,photos,year) {
        let re   = new RegExp("^"+year+"_.+","i");
        photos.filter( p => (p.timestamp.getFullYear()==year) && (p.title.match(re)==null) ).forEach( (p) => {
            console.log(p.id+" => "+p.title);
        });
    }),
    new Action("gphotos_mismatchingYears","shows GPhotos photos whose title mismatch the image timestamp",false,true,function(images,photos) {
        photos.filter( p => p.title.indexOf(p.timestamp.getFullYear()+"_")!=0).forEach( (p) => {
            console.log(p.id+" => year="+p.timestamp.getFullYear()+","+p.title);
        });
    }),
    new Action("gphotos_minusImagesYear=year","shows GPhotos photos that are not among images for given year",true,true,function(images,photos,year) {
        common.subtract_items(
            photos.filter( p => (p.timestamp.getFullYear()==year) ),
            images.filter( i => { i.title=i.gphotos_path; return (i.timestamp.getFullYear()==year); } )
        ).forEach( p => {
            if( p.closest_match ) {
                console.log(p.id+" => "+p.timestamp+","+p.content.src+", closest is "+p.closest_match.path+" with timestamp="+p.closest_match.timestamp);
            }
            else {
                console.log(p.id+" => "+p.timestamp+","+p.content.src+", this photo DOES NOT HAVE CLOSEST IMAGE");
            }
        });
    }),
    new Action("gphotos_count","shows the count of photos in GPhotos",false,true,function(images,photos) {
        console.log(photos.length);
    }),
    new Action("// Actions on images (i.e. file system)"),
    new Action("images_showYears","shows the number of images has for each year",true,false,function(images,photos) {
        let by_years = images.toHash(p => p.timestamp.getFullYear(),true);
        for( let year in by_years ) {
            console.log(year+": "+by_years[year].length+" photos");
        }
    }),
    new Action("images_showYear=year","shows images timestamped to given year",true,false,function(images,photos,year) {
        images.filter( p => p.timestamp.getFullYear()==year ).forEach( (p) => {
            console.log(p.id+" => "+p.path);
        });
    }),
    new Action("images_matchingGPhotosPath=pattern","shows images with gphotos_path matching given regexp pattern",true,false,function(images,photos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        images.filter( p => p.gphotos_path.match(re) ).forEach( (p) => {
            console.log(p.id+" => "+p.path);
        });
    }),
    new Action("images_mismatchingGPhotosPath=pattern","shows images with gphotos_path not matching given regexp pattern",true,false,function(images,photos) {
        let re = new RegExp(common.argv[this.name_parts[0]],"i");
        images.filter( p => (p.gphotos_path.match(re)==null) ).forEach( (i) => {
            console.log(i.id+" => "+i.path);
        });
    }),
    new Action("images_mismatchingYear=year","shows images timestamped to given year and with gphotos_path mismatching the year",true,false,function(images,photos,year) { 
        let re   = new RegExp("^"+year+"_.+","i");
        images.filter( p => (p.timestamp.getFullYear()==year) && (p.gphotos_path.match(re)==null) ).forEach( (i) => {
            console.log(i.id+" => "+i.path);
        });
    }),
    new Action("images_mismatchingYears","shows images whose title mismatch the image timestamp",true,false,function(images,photos) {
        images.filter( p => p.gphotos_path.indexOf(p.timestamp.getFullYear()+"_")!=0 ).forEach( (i) => {
            console.log(i.id+" => year="+i.timestamp.getFullYear()+","+i.title);
        });
    }),
    new Action("images_minusGPhotosYear=year","shows images that are not among GPhotos photos for given year",true,true,function(images,photos,year) {
        common.subtract_items(
            images.filter( i => { i.title=i.gphotos_path; return (i.timestamp.getFullYear()==year); } ),
            photos.filter( p => (p.timestamp.getFullYear()==year) )
        ).forEach( i => {
            if( i.closest_match ) {
                console.log(i.id+" => "+(new common.EXIFDate(i.timestamp)).toEXIFString()+","+i.path+",closest is "+(new common.EXIFDate(i.closest_match.timestamp)).toEXIFString()+".\nTry:\n"+
                            "/usr/bin/exiftool '-AllDates="+(new common.EXIFDate(i.closest_match.timestamp)).toEXIFString()+"' '"+i.path+"'\n"+
                            process.argv[0]+" CacheTool.js "+
                            "--images "+
                            "--update "+
                            "'--where=id=^"+i.id+"$' "+
                            "--from_path");
            }
            else {
                console.log(i.id+" => "+(new common.EXIFDate(i.timestamp)).toEXIFString()+","+i.path+", this image DOES NOT HAVE CLOSEST PHOTO");
            }
        });
    }),
    new Action("images_checkExifInfoYear=year","reads images of given year and makes sure that their path location matches their EXIF timestamps",true,false,function(images,photos,year) {
        try {
            let imageFolder = new Images.ImageFolder(common.imagesRoot+"/"+year);
            imageFolder.read_file_system();
            imageFolder.check_exif_locations();
        }
        catch( err ) {
            console.log("Exception from checking images ("+err+")");
        }
    }),
    new Action("images_count","shows the count of images",true,false,function(images,photos) {
        console.log(images.length);
    }),
    new Action("// Other"),
    new Action("deltaYear=year","shows differences in objects timestamped to particular year",true,true,function(images,photos,year) {
        _ACTIONS.filter(a => ["images_minusGPhotosYear","gphotos_minusImagesYear"].indexOf(a.name_parts[0])>=0 ).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(images,photos,year);
        });
    }),
    new Action("showYear=year","shows objects timestamped to particular year",true,true,function(images,photos,year) {
        _ACTIONS.filter(a => ["images_showYear","gphotos_showYear"].indexOf(a.name_parts[0])>=0 ).forEach( a => {
            console.log(a.name_parts[0]+":");
            (a.proc.bind(a))(images,photos,year);
        });
    }),
    new Action("showYears","for each year show how many images and photos it has",true,true,function(images,photos) {
        let photos_by_years = photos.toHash(p => p.timestamp.getFullYear(),true);
        let images_by_years = images.toHash(i => i.timestamp.getFullYear(),true);
        Object.keys(photos_by_years).reduce( (accumulator,year) => {
            if( !accumulator.includes(year) )
                accumulator.push(year);
            return accumulator;
        },Object.keys(images_by_years)).sort().forEach( year => {
            let photos_count = (photos_by_years.hasOwnProperty(year)?photos_by_years[year].length:0);
            let images_count = (images_by_years.hasOwnProperty(year)?images_by_years[year].length:0);
            console.log(year+": "+photos_count+" photos, "+images_count+" images"+((photos_count!=images_count)?" <==":""));
        });
    }),
    new Action("images_to_gphotos","enumerate all files on the file system and make sure that GPhotos has the copy",true,true,function(images,photos) {
        console.log(this.name_parts[0]+" is not implemented");
    }),
];
/////////////////////////////////////////////////////////////////
// functions
/////////////////////////////////////////////////////////////////
function get_images( storage_file ) {
    return new Promise( (resolve,reject) => {
        return resolve(new Storage(require(storage_file)));
    }).catch( (err) => {
        let images = new Storage();
        return (new Images.ImageFolder(common.imagesRoot)).getImages(images).then( () => {
            common.exiftool.end();
            common.log(1,"Got "+images.size+" images, writing to "+storage_file);
            fs.writeFileSync(storage_file,JSON.stringify(images.storage));
            return images;
        });
    });
}
function get_photos( storage_file ) {
    return new Promise( (resolve,reject) => {
        return resolve(new Storage(require(storage_file)));
    }).catch( (err) => {
        const photos  = new Storage();
        const gphotos = new GPhotos();
        return gphotos.login().then( () => {
            console.log("Successfully logged in");
            return gphotos.getPhotos(photos).then( (whatever) => {
                common.log(1,"Got "+photos.size+" photos, writing to "+storage_file);
                fs.writeFileSync(storage_file,JSON.stringify(photos.storage));
                return photos;
            });
        });
    });
}
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
let valid_actions = _ACTIONS.filter( a => common.argv.hasOwnProperty(a.name_parts[0]) && a.proc );
if( valid_actions.length ) {
    let images,photos;
    valid_actions.forEach( (a) => {
        let imagesPromise = a.needs_images ? (images ? images : get_images(common.imagesCache).then( (images_) => {
            return images = Object.values(images_.storage);
        }).catch( (err) => {
            common.log(1,"There was an error getting images ("+err+")");
        })) : undefined;
        let photosPromise = a.needs_photos ? (photos ? photos : get_photos(common.photosCache).then( (photos_) => {
            return photos = Object.values(photos_.storage);
        }).catch( (err) => {
            common.log(1,"There was an error getting photos ("+err+")");
        })) : undefined;
        a.call(imagesPromise,photosPromise,Number(common.argv[a.name_parts[0]])).catch( (err) => {
            common.log(1,"Exception from handler "+a.name+" ("+err+")");
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
