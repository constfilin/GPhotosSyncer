#!/usr/bin/nodejs

"use strict";

const fs     = require('fs');
const async  = require('async');

const common  = require('./common');
const Storage = require('./Storage');
const Picasa  = require('./Picasa');
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
}
const _ACTIONS = [
  new Action("// Actions on picasa"),
  new Action("picasa_showYears","shows the number of images Picasa has for each year",false,true,function(images,photos) {
    let by_years = Object.values(photos.storage).toHash(p => p.timestamp.getFullYear(),true);
    for( let year in by_years ) {
      console.log("For year "+year+" there are "+by_years[year].length+" photos");
    }
  }),
  new Action("picasa_showYear=year","shows Picasa photos timestamped to given year",false,true,function(images,photos) {
    let year = Number(common.argv[this.name_parts[0]]);
    Object.values(photos.storage).filter(p => p.timestamp.getFullYear()==year).forEach( (p) => {
      console.log(p.title+" => timestamp="+p.timestamp+",id="+p.id);
    });
  }),
  new Action("picasa_matchingTitle=pattern","shows Picasa photos with titles matching given regexp pattern",false,true,function(images,photos) {
    let re = new RegExp(common.argv[this.name_parts[0]],"i");
    Object.values(photos.storage).filter( p => p.title.match(re) ).forEach( (p) => {
      console.log(p.id+" => "+p.title);
    });
  }),
  new Action("picasa_mismatchingTitle=pattern","shows Picasa photos with titles not matching given regexp pattern",false,true,function(images,photos) {
    let re = new RegExp(common.argv[this.name_parts[0]],"i");
    Object.values(photos.storage).filter( p => (p.title.match(re)==null) ).forEach( (p) => {
      console.log(p.id+" => "+p.title);
    });
  }),
  new Action("picasa_mismatchingYear=year","shows Picasa photos timestamped to given year and with title mismatching the year",false,true,function(images,photos) {
    let year = Number(common.argv[this.name_parts[0]]); 
    let re   = new RegExp("^"+year+"_.+","i");
    Object.values(photos.storage).filter( p => (p.timestamp.getFullYear()==year) && (p.title.match(re)==null) ).forEach( (p) => {
	console.log(p.id+" => "+p.title);
    });
  }),
  new Action("picasa_mismatchingYears","shows Picasa photos whose title mismatch the image timestamp",false,true,function(images,photos) {
    Object.values(photos.storage).filter( p => p.title.indexOf(p.timestamp.getFullYear()+"_")!=0 ).forEach( (p) => {
      console.log(p.id+" => year="+p.timestamp.getFullYear()+","+p.title);
    });
  }),
  new Action("picasa_minusImagesYear=year","shows Picasa photos that are not among images for given year",true,true,function(images,photos) {
    let year = Number(common.argv[this.name_parts[0]]);
    Object.values(common.hash_diff(
      Object.values(photos.storage).filter( p => (p.timestamp.getFullYear()==year) ).toHash( p => p.id ),
      Object.values(images.storage).filter( i => (i.timestamp.getFullYear()==year) ).toHash( i => i.id )
    )).forEach( p => {
      console.log(p.title+" => "+p.timestamp+","+p.content.src);
    });
  }),
  new Action("picasa_count","shows the count of photos in Picasa",false,true,function(images,photos) {
    console.log(photos.size);
  }),
  new Action("// Actions on images (i.e. file system)"),
  new Action("images_showYears","shows the number of images has for each year",true,false,function(images,photos) {
    let by_years = Object.values(images.storage).toHash(p => p.timestamp.getFullYear(),true);
    for( let year in by_years ) {
      console.log("For year "+year+" there are "+by_years[year].length+" photos");
    }
  }),
  new Action("images_showYear=year","shows images timestamped to given year",true,false,function(images,photos) {
    let year = Number(common.argv[this.name_parts[0]]);
    Object.values(images.storage).filter( p => p.timestamp.getFullYear()==year ).forEach( (p) => {
      console.log(p.id+" => "+p.path);
    });
  }),
  new Action("images_matchingGPhotosPath=pattern","shows images with gphotos_path matching given regexp pattern",true,false,function(images,photos) {
    let re = new RegExp(common.argv[this.name_parts[0]],"i");
    Object.values(images.storage).filter( p => p.gphotos_path.match(re) ).forEach( (p) => {
      console.log(p.id+" => "+p.path);
    });
  }),
  new Action("images_mismatchingGPhotosPath=pattern","shows images with gphotos_path not matching given regexp pattern",true,false,function(images,photos) {
    let re = new RegExp(common.argv[this.name_parts[0]],"i");
    Object.values(images.storage).filter( p => (p.gphotos_path.match(re)==null) ).forEach( (i) => {
      console.log(i.id+" => "+i.path);
    });
  }),
  new Action("images_mismatchingYear=year","shows images timestamped to given year and with gphotos_path mismatching the year",true,false,function(images,photos) { 
    let year = Number(common.argv[this.name_parts[0]]); 
    let re   = new RegExp("^"+year+"_.+","i");
    Object.values(images.storage).filter( p => (p.timestamp.getFullYear()==year) && (p.gphotos_path.match(re)==null) ).forEach( (i) => {
      console.log(i.id+" => "+i.path);
    });
  }),
  new Action("images_mismatchingYears","shows images whose title mismatch the image timestamp",true,false,function(images,photos) {
    Object.values(images.storage).filter( p => p.gphotos_path.indexOf(p.timestamp.getFullYear()+"_")!=0 ).forEach( (i) => {
      console.log(i.id+" => year="+i.timestamp.getFullYear()+","+i.title);
    });
  }),
  new Action("images_minusGPhotosYear=year","shows images that are not among Picasa photos for given year",true,true,function(images,photos) {
    let year = Number(common.argv[this.name_parts[0]]);
    Object.values(common.hash_diff(
      Object.values(images.storage).filter( i => (i.timestamp.getFullYear()==year) ).toHash( i => i.id ),
      Object.values(photos.storage).filter( p => (p.timestamp.getFullYear()==year) ).toHash( p => p.id )
    )).forEach( i => {
      console.log(i.gphotos_path+" => "+i.timestamp+","+i.path);
    });
  }),
  new Action("images_count","shows the count of images",true,false,function(images,photos) {
    console.log(images.size);
  }),
  new Action("// Other"),
  new Action("picasa_to_images","enumerate all Picasa files and make sure that file system has the copy",true,true,function(images,photos) {
    console.log(this.name_parts[0]+" is not implemented");
  }),
  new Action("images_to_picasa","enumerate all files on the file system and make sure that Picasa has the copy",true,true,function(images,photos) {
    console.log(this.name_parts[0]+" is not implemented");
  }),
];
/////////////////////////////////////////////////////////////////
// functions
/////////////////////////////////////////////////////////////////
function get_images( storage_file, callback ) {
  try {
    callback(null,new Storage(require(storage_file)));
  }
  catch( err ) {
    async.waterfall([
      ( callback ) => {
	(new Images(common.imagesRoot)).getImages(new Storage(),(err,images) => {
	  if( err ) {
	    common.log(1,"Cannot read images ("+err+")");
	  }
	  callback(err,images);
	});
      },
      ( images, callback ) => {
	common.log(1,"Got "+images.size+" images");
	fs.writeFileSync(storage_file,JSON.stringify(images.storage));
	callback(null,images);
      }],
      ( err, images ) => {
	if( !err ) {
	  callback(null,images);
	}
      }
    );
  }
}
function get_photos( storage_file, callback ) {
  try {
    callback(null,new Storage(require(storage_file)));
  }
  catch( err ) {
    const picasa = new Picasa();
    async.waterfall([
      ( callback ) => {
	picasa.login((err,whatever)=>{
          common.log(1,"login finished with err="+err);
          callback(err,whatever);
	});
      },
      ( whatever, callback ) => {
	picasa.getAlbums((err,albums)=>{
          common.log(1,"getAlbums finished with err="+err);
          callback(err,albums);
	});
      },
      ( albums, callback ) => {
	const photos = new Storage();
	async.each(
	  albums,
	  (album,callback) => {
	    picasa.getPhotos(album,photos,(err,photos) => {
	      common.log(1,"Got "+photos.size+" photos of album '"+album.title+"' ("+err+")");
	      callback(err,photos);
	    });
	  },
	  (err) => {
	    callback(err,photos);
	  }
	);
      },
      ( photos, callback ) => {
	common.log(1,"Got "+photos.size+" photos");
	fs.writeFileSync(storage_file,JSON.stringify(photos.storage));
	callback(null,photos);
      }],
      ( err, photos ) => {
	if( !err ) {
	  callback(null,photos);
	}
      }
    );
  }
}
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
let valid_actions = _ACTIONS.filter( a => common.argv.hasOwnProperty(a.name_parts[0]) && a.proc );
if( valid_actions.length ) {
  let images,photos;
  valid_actions.forEach( (a) => {
    async.waterfall([
      (callback) => {
	if( !a.needs_images || images ) {
	  callback(null);
	}
	else {
	  get_images('./allimages.json',(err,images_)=> {
	    if( err ) {
	      common.log(1,"There was an error getting images ("+err+")");
	    }
	    else {
	      images = images_;
	    }
	    callback(err);
	  });
	}
      },
      (callback) => {
	if( !a.needs_photos || photos ) {
	  callback(null,photos);
	}
	else {
	  get_photos('./allphotos.json',(err,photos_)=>{
	    if( err ) {
	      common.log(1,"There was an error getting photos ("+err+")");
	    }
	    else {
	      photos = photos_;
	    }
	    callback(err);
	  });
	}
      }],
      (err) => {
	if( err ) {
	  common.log(1,"There were errors ("+err+")");
	}
	else {
	  try {
	    (a.proc.bind(a))(images,photos);
	  }
	  catch( err ) {
	    common.log(1,"Exception from handler "+a.name+" ("+err+")");
	  }
	}
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
      "   "+process.argv[1]+" --images_minusGPhotosYear=1915 --picasa_minusImagesYear=1915\n"+
      "Will show all the delta between images stored on file system and in GPhotos for year 1915.\n"
  );
}
