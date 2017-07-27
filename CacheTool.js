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
	      "        --where=WHERE    - defines which objects to show. Takes the form:\n"+
	      "                           key=pattern  - selects the objects where 'key' matches RE 'pattern'\n"+
	      "                           If omitted then all objects are shown. If specified several times then\n"+
	      "                           the conditions are all joined by AND\n"+
	      "        --KEY            - for each object on the cache print the value of the key identified by 'key'\n"+
	      "                           Can be repeated several times. If no keys are given then all values are shown\n"+
	      "        EXAMPLE: --select --title --id\n"+
	      "    update:\n"+
	      "        --where=WHERE    - defines which objects to update. If omitted then all objects are updated\n"+
	      "        --KEY=command    - replaces the value of each property identifiy by 'key' with SED like substitute command\n"+
	      "                           Can be repeated several times\n"+
	      "        --from_path      - If --images is provided then replaces the cache value with info re-read from image path\n"+
	      "        EXAMPLE: --update '--title=/^(.+)_mov$/$1.mov/i'\n"+
	      "    delete:\n"+
	      "        --where=WHERE     - defines which objects to delete. REQUIRED\n"+
	      "        EXAMPLE: --delete --oid=1234\n"+
	      "    readfile:\n"+
	      "        --readfile=path  - reads the file from file system and dumps its as a cache item\n"+
  	      "         EXAMPLE  --readfile=/a/b/c/movie.mov\n");
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
    'from_path',
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
function _parse_where() {
  if( !common.argv.hasOwnProperty('where') ) {
    return (key,value) => { return true; };
  } 
  let keys_and_REs = ((common.argv.where instanceof Array) ? common.argv.where : [common.argv.where]).map( where => {
    let where_matches = where.match(/^([^=]+)=(.+)$/);
    if( !where_matches ) {
      console.log("Where '"+where+"' is not in the form key=value. Skipping it.");
      return undefined;
    }
    return {key:where_matches[1],'re':new RegExp(where_matches[2],"i")};
  });
  return (key,value) => { return keys_and_REs.every( kr => (kr==undefined) || (value.hasOwnProperty(kr.key) && kr.re.test(value[kr.key])) ) };
}
function select( cachefile, cache ) {  
  let cmd_keys = _get_cmd_keys();
  let where    = _parse_where();
  for( let key in cache ) {
    let object = cache[key];
    if( where(key,object) ) { 
      if( cmd_keys.length==0 ) {
	console.log(object);
      }
      else {
	console.log(cmd_keys.map( k=>object[k] ).join(";"));
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
      console.log("'"+sed_cmd+" does not look like a SED substitute command. Using '"+sed_cmd+"' as new value for key '"+key+"'");
      SEDs[key] = {
	value : sed_cmd
      };
    }
    else {
      SEDs[key] = {
	match   : new RegExp(sed_parts[1],sed_parts[3]),
	replace : sed_parts[2]
      };
    }
  });
  
  let where           = _parse_where();
  let values_updated  = 0;
  let records_updated = 0;
  for( let key in cache ) {
    let object = cache[key];
    if( where(key,object) ) {
      if( common.argv.hasOwnProperty('images') && common.argv.hasOwnProperty('from_path') ) {
	let imageFile = _get_image_file(object.path);
	//console.log("Re-reading from "+object.path+",timestamp="+imageFile.timestamp);
	values_updated += Object.values(imageFile).length;
	records_updated++;
	delete cache[key];
	cache[imageFile.id] = imageFile;
      }
      else {
	let got_change = false;
	for( let ndx in SEDs ) {
	  if( object.hasOwnProperty(ndx) ) {
	    let value = SEDs[ndx].hasOwnProperty('value') ? SEDs[ndx].value : object[ndx].replace(SEDs[ndx].match,SEDs[ndx].replace);
	    if( value!=object[ndx] ) {
	      common.log(2,"In '"+key+"' updating '"+ndx+"' from '"+object[ndx]+"' to '"+value+"'");
	      object[ndx] = value;
	      values_updated++;
	      if( ndx=='id' ) {
		delete cache[key];
		cache[value] = object;
	      }
	      got_change = true;
	    }
	    else {
	      common.log(2,"In '"+key+"' value of '"+ndx+"' did not change from '"+object[ndx]+"'");
	    }
	  }
	}
	if( got_change )
	  records_updated++;
      }
    }
  }

  if( values_updated>0 ) {
    console.log("Updating "+values_updated+" values in "+records_updated+" records: "+_save_cache(cachefile,cache));
  }
  else {
    console.log("No changes to save");
  }
  
}
function delete_( cachefile, cache ) {
  
  let where           = _parse_where();
  let records_deleted = 0;
  for( let key in cache ) {
    if( where(key,cache[key]) ) {
      delete cache[key];
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
  common.log(4,"Reading from '"+cachefile+"'");
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
