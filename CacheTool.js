const fs       = require('fs');
const exiftool = require('exiftool-vendored').exiftool;
const deasync  = require('deasync');

const common   = require('./common');
const Images   = require('./Images');

/////////////////////////////////////////////////////////////////
// functions
/////////////////////////////////////////////////////////////////
function help() {
  console.log("USAGE: "+process.argv[1]+" --cache --action action_args\n"+
	      "'cache' can be one of:\n"+
	      "    --images       - reads '"+common.imagesCache+"'\n"+
	      "    --photos       - reads '"+common.photosCache+"'\n"+
	      "'action' can be one of:\n"+
	      "    select:\n"+
	      "        --where=oid      - specifies the object ID to show. If omitted then all objects are shown\n"+
	      "        --KEY            - for each object on the cache print the value of the key identified by 'key'\n"+
	      "                           Can be repeated several times. If no keys are given then all values are shown\n"+
	      "        EXAMPLE: --select --title --id\n"+
	      "    update:\n"+
	      "        --where=oid      - specifies the object ID to update. If omitted then all objects are updated\n"+
	      "        --KEY=command    - replaces the value of each property identifiy by 'key' with SED like substitute command\n"+
	      "                           Can be repeated several times\n"+
	      "        --fromimage=file - If --images and --where are BOTH provided then replaces the cache value with info from given file\n"+
	      "        EXAMPLE: --update '--title=/^(.+)_mov$/$1.mov/i'\n"+
	      "    delete:\n"+
	      "        --where=oid      - specifies the object ID to delete. REQUIRED\n"+
	      "        EXAMPLE: --delete --oid=1234\n"+
	      "    readfile:\n"+
	      "        --where=path     - reads the file from file system and dumps its as a cache item\n"+
	     "         EXAMPLE  --readfile --where=/a/b/c/movie.mov\n");
}

function _save_cache( cachefile, cache ) {
  try {
    fs.renameSync(cachefile,cachefile+".backup");
    try {
      fs.writeFileSync(cachefile,JSON.stringify(cache));
      return "";
    }
    catch( err ) {
      return "Cannot save to '"+cachefile+"' ("+err+")";
    }
    fs.renameSync(cachefile+".backup",cachefile);
  }
  catch( err ) {
    return "Cannot create a backup of '"+cachefile+"' ("+err+")";
  }
}
function _get_cmd_keys() {
  const _RESERVED_CMDLINE_KEYS = [
    '_',
    'loglevel',
    'images',
    'photos',
    'where',
    'select',
    'update',
    'delete',
    'readfile',
    'fromimage',
  ];
  return Object.keys(common.argv).filter( key => _RESERVED_CMDLINE_KEYS.indexOf(key)<0 );
}
function _get_image_file( path ) {
  let done = false;
  let imageFile = new Images.ImageFile(path);
  imageFile.read_exif_info( ( err, result ) => {
    done = true;
  });
  deasync.loopWhile(function() { return !done; });
  return imageFile;
}
function select( cachefile, cache ) {  
  let cmd_keys = _get_cmd_keys();
  for( let oid in cache ) {
    let object = cache[oid];
    if( !common.argv.hasOwnProperty('where') || (common.argv['where']==oid) ) {
      if( cmd_keys.length==0 ) {
	console.log(object);
      }
      else {
	console.log(oid+":"+_get_cmd_keys().map( k=>object[k] ).join(";"));
      }
    }
  }
}
function update( cachefile, cache ) {
  
  let SEDs = {};
  _get_cmd_keys().forEach( key => {
    let sed_cmd   = common.argv[key];
    let sed_parts = sed_cmd.split(sed_cmd[0]);
    if( (sed_parts.length!=4) || (sed_parts[0]!='') ) {
      console.log("'"+sed_cmd+" does not look like a SED substitute command. Ignoring it for key '"+key+"'");
    }
    SEDs[key] = {
      match   : new RegExp(sed_parts[1],sed_parts[3]),
      replace : sed_parts[2]
    };
  });
  
  let values_updated = 0;
  for( let oid in cache ) {
    if( !common.argv.hasOwnProperty('where') || (common.argv['where']==oid) ) {
      if( common.argv.hasOwnProperty('images') && common.argv.hasOwnProperty('fromimage') ) {
	let imageFile = _get_image_file(common.argv.fromimage);
	values_updated += Object.values(imageFile).length;
	delete cache[oid];
	cache[imageFile.id] = imageFile;
      }
      else {
	let object = cache[oid];
	for( let key in SEDs ) {
	  if( object.hasOwnProperty(key) ) {
	    let value = object[key].replace(SEDs[key].match,SEDs[key].replace);
	    if( value!=object[key] ) {
	      common.log(2,"In '"+oid+"' updating '"+key+"' from '"+object[key]+"' to '"+value+"'");
	      object[key] = value;
	      values_updated++;
	      if( key=='id' ) {
		delete cache[oid];
		cache[value] = object;
	      }
	    }
	    else {
	      common.log(2,"In '"+oid+"' value of '"+key+"' did not change from '"+object[key]+"'");
	    }
	  }
	}
      }
    }
  }

  if( values_updated>0 ) {
    console.log("Updating "+values_updated+" values: "+_save_cache(cachefile,cache));
  }
  else {
    console.log("No changes to save");
  }
  
}
function delete_( cachefile, cache ) {
  
  let records_deleted = 0;
  for( let oid in cache ) {
    if( common.argv['where']==oid ) {
      delete cache[oid];
      records_deleted++;
    }
  }

  if( records_deleted>0 ) {
    console.log("Deleted "+records_deleted+" records: "+_save_cache(cachefile,cache));
  }
  else {
    console.log("No changes to save");
  }
  
}
function readfile( filename ) {
  console.log(_get_image_file(filename));
}
/////////////////////////////////////////////////////////////////
// top level
/////////////////////////////////////////////////////////////////
let cachefile = (common.argv.hasOwnProperty('images') ? common.imagesCache :
		  (common.argv.hasOwnProperty('photos') ? common.photosCache : 'n/a'));
let autoprefix = (cachefile.indexOf("/")==0 || cachefile.indexOf("./")==0) ? "" : "./";
try {
  console.log("Reading from '"+cachefile+"'");
  let cache = require(autoprefix+cachefile);
  try {
    if( common.argv['select'] ) {
      select(cachefile,cache);
    }
    else if( common.argv['update'] ) {
      update(cachefile,cache);
    }
    else if( common.argv['delete'] ) {
      delete_(cachefile,cache);
    }
    else if( common.argv['readfile'] ) {
      readfile(common.argv.readfile);
    }
    else {
      help();
    }
  }
  catch( err ) {
    console.log("Cannot execute the action  ("+err+")");
    help();
  }
}
catch( err ) {
  console.log("Cannot read '"+cachefile+"' ("+err+")");
  help();
}
common.exiftool.end();
