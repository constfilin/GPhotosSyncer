const fs     = require('fs');
const common = require('./common');

function help() {
  console.log("USAGE: "+process.argv[1]+" --storagefile=storagefile --oid=oid [--key=value]*...");
}

if( common.argv.storagefile ) {
  let storagefile = common.argv.storagefile;
  let autoprefix  = (storagefile.indexOf("/")==0 || storagefile.indexOf("./")==0) ? "" : "./";
  try {
    let storage = require(autoprefix+storagefile);
    if( common.argv.hasOwnProperty('oid') ) {
      if( storage.hasOwnProperty(common.argv.oid) ) {
	let object = storage[common.argv.oid];
	console.log("Before:");
	console.log(object);
	let got_changes = false;
	Object.keys(common.argv).filter( key => ['_','storagefile','oid','loglevel'].indexOf(key)<0 ).forEach( key => {
	  object[key] = common.argv[key];
	  got_changes = true;
	});
	if( common.argv.hasOwnProperty('id') && common.argv.id!=common.argv.oid ) {
	  console.log("Updating object ID");
	  // Object ID has changed
	  delete storage[common.argv.oid];
	  storage[common.argv.id] = object;
	  got_changes = true;
	}
	if( got_changes ) {
	  console.log("After:");
	  console.log(object);
	  try {
	    fs.renameSync(storagefile,storagefile+".backup");
	    try {
	      fs.writeFileSync(storagefile,JSON.stringify(storage));
	      process.exit(0);
	    }
	    catch( err ) {
	      console.log("Cannot save to '"+storagefile+"' ("+err+")");
	    }
	    fs.renameSync(storagefile+".backup",storagefile);
	  }
	  catch( err ) {
	    console.log("Cannot create a backup of '"+storagefile+"' ("+err+")");
	  }
	}
	else {
	  console.log("No changes need saving");
	}
      }
      else {
	console.log("Cannot find id '"+common.argv.oid+"' in '"+common.argv.storagefile+"'");
      }
    }
    else {
      help();
    }
  }
  catch( err ) {
    console.log("Cannot read '"+storagefile+"' ("+err+")");
    help();
  }
}
else {
  help();
}
