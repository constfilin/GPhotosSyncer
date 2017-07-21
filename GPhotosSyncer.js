#!/usr/bin/nodejs

"use strict";

const common  = require('./common');
const GPhotos = require('./GPhotos');
const Images  = require('./Images');

/////////////////////////////////////////////////////////////////
// functions
/////////////////////////////////////////////////////////////////
function do_gphotos_action( callback ) {
  GPhotos.gphotos.login( (err,whatever) => {
    if( err ) {
      callback(Error("Cannot login to GPhotos ("+err+")"),whatever);
    }
    else {
      GPhotos.gphotos.read(common.argv.prefix,function( err, result ) {
	if( err ) {
	  callback(Error("There were errors reading from GPhotos ("+err+")"),result);
	}
	else {
	  callback(null,result);
	}    
      });
    }
  });
}
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
if( common.argv.hasOwnProperty('help') || !common.argv.action ) {
  console.log(
    "USAGE: %s [--loglevel=loglevel] [--dryrun] --action=action --prefix=\n" +
      "--loglevel - defines verbosity.\n" +
      "--dryrun   - just report inconsistencies found without prompting to fix them\n"+
      "--action   - Describes what we are going to do. It is either:\n" +
      "                  gphotos_to_images - enumerate all GPhotos/videos and make sure that file system has the copy\n"+
      "                  images_to_gphotos - enumerate all files on the file system and make sure that GPhotos has the copy\n"+
      "                  check_images      - enumerate all files on the FS and make sure they have names and paths matchingtheir EXIF data\n"+
      "if action is check_file_system then there are additional args\n"+
      "   --prefix - gives the root from ("+common.imagesRoot+") where to start enumarating the files and look for insonsitencies\n"+
      "if action is gphotos_to_images then there are additional args\n"+
      "   --prefix - the prefix of the photo names to get from GPhotos, default is '' (search all)\n"+
      "if action is images_to_gphotos then there are additional args\n"+
      "   --prefix - file location (from '"+common.imagesRoot+"') of the files to read from file system, default is '' (search all)\n",
    process.argv[1]);
  process.exit(0);
}
let imageFolder = new Images.ImageFolder(common.imagesRoot+"/"+common.argv.prefix);
imageFolder.read(function( err, result ) {
  if( err ) {
    common.log(1,"Cannot read image folder ("+result+")");
  }
  else {
    let result;
    switch( common.argv.action.toLowerCase() ) {
    case "gphotos_to_images":
      do_gphotos_action( (err,gphoto_files) => {
	if( err ) {
	  common.log(1,err);
	}
	else {
	  common.compare_timestamp_hashes(GPhotos.GPhotos.hash_files_by_timestamp(gphoto_files),
                                          GPhotos.GPhotoFile,
					  imageFolder.hash_files_by_timestamp(),
                                          Images.ImageFile);
	}
      });
      break;
    case "images_to_gphotos":
      do_gphotos_action( (err,gphoto_files) => {
	if( err ) {
	  common.log(1,err);
	}
	else {
          common.compare_timestamp_hashes(imageFolder.hash_files_by_timestamp(),
                                          Images.ImageFile,
                                          GPhotos.GPhotos.hash_files_by_timestamp(gphoto_files),
                                          GPhotos.GPhotoFile);
	}
      });
      break;
    case "check_file_system":
      if( (result=imageFolder.check_exif_locations())!='' ) {
	common.log(1,"There were some errors ("+result+")");
      }
      break;
    default:
      console.log("Unknown action '"+common.argv.action+"'");
      break;
    }
    common.log("All done");
  }
});
