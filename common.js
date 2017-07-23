"use strict";

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const util         = require('util');
const deasync      = require('deasync');

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class EXIFDate extends Date {
  constructor( year, month, date, hour, minute, second ) {
    super(year,month,date,hour,minute,second);
  }
  toEXIFString() {
    let common = module.exports;
    return this.getFullYear()+":"+common.pad_number(this.getMonth()+1,2)+":"+common.pad_number(this.getDate(),2)+" "+
      common.pad_number(this.getHours(),2)+":"+common.pad_number(this.getMinutes(),2)+":"+common.pad_number(this.getSeconds());
  }
  static fromEXIFString( es ) {
    let m;
    if( (m=String(es).match(/^([0-9]+):([0-9]{2}):([0-9]{2})[ \t]+([0-9]{2}):([0-9]{2}):([0-9]{2}).*$/i)) ) {
      if( Number(m[2])==0 ) m[2] = 6; // If month is set to 0 incorrectly then default it to June
      return new EXIFDate(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]));
    }
    return new EXIFDate('Invalid Date');
  }
}
/////////////////////////////////////////////////////////////////
// module exports
/////////////////////////////////////////////////////////////////
module.exports = {
  imagesRoot : "/media/WDPASSPORT/public/Video",
  'EXIFDate' : EXIFDate,
  month_names : [
    '',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'  
  ],
  argv : (() => {
    const result = require('minimist')(process.argv.slice(2));
    result.loglevel = result.hasOwnProperty('loglevel') ? Number(result.loglevel) : 0;
    return result;
  })(),
  log(level) {
    if (this.argv.loglevel > level) {
      const args = (arguments.length === 2) ? [arguments[0], arguments[1]] : new Array(...arguments);
      args.shift();
      console.log(level + ": " + util.format(...args));
    }
  },
  pad_number( n, max_length ) {
    let result = String(n);
    for( let l=result.length; l<max_length; l=result.length ) {
      result = '0'+result;
    }
    return result;
  },
  match_string( s, re, capture_names ) {
    let matches = s.match(re);
    if( !matches )
      return null;
    let result = {};
    capture_names.forEach( (nc,ndx) => {
      result[nc] = matches[ndx+1];
    });
    return result;
  },
  get_answer( prompt, default_answer ) {
    let rl = require('readline').createInterface({
      input : process.stdin,
      output: process.stdout
    });	  
    let result = undefined;
    rl.question(prompt+' (default is '+default_answer+'): ',function( answer ) {
      rl.close();
      result = answer;
    });
    deasync.loopWhile( function() {
      return result===undefined;
    });
    return (result=='') ? default_answer : result;    
  },
  compare_timestamp_hashes( hash1, hash1_element_constructor, hash2, hash2_element_constructor ) {

    //let hash2_keys = Object.keys(hash2).sort();
    let common         = module.exports;
    let default_answer = undefined;
    let result         = undefined;

    for( let ts in hash1 ) {
      let hash1_elements = hash1[ts];
      if( hash1_elements.length==1 ) {
	let hash1_element = hash1_elements[0];
	let hash2_elements = hash2.hasOwnProperty(ts) ? hash2[ts] : [];
	if( hash2_elements.length==0 ) {
	  result = "There are no "+hash2_element_constructor.name+"s with timestamp '"+ts+"' corresponding to "+hash1_element_constructor.name+" '"+hash1_element+"'";
	  if( common.argv.hasOwnProperty("dryrun") ) {
	    common.log(1,result);
	  }
	  else {
	    default_answer = common.get_answer(
	      "There are no "+hash2_element_constructor.name+"s with timestamp '"+ts+"' corresponding to "+hash1_element_constructor.name+" '"+hash1_element+"'. Fix it?",
	      default_answer);
	    if( default_answer=='y' ) {
	      if( (result=hash2_element_constructor.create(hash1_element))=='' ) {
		common.log(2,"Uploaded "+hash1_element_constructor.name+" '"+hash1_element+" to "+hash2_element_constructor.name);
	      }
	      else {
		common.log(2,"Cannot upload  "+hash1_element_constructor.name+" '"+hash1_element+" to "+hash2_element_constructor.name+" ("+result+")");
	      }
	    }
	  }
	}
	else if( hash2_elements.length==1 ) {
	  let hash2_element = hash2_elements[0];
	  common.log(4,"Found "+hash2_element_constructor.name+" '"+hash2_element+"' corresponding to "+hash1_element_constructor.name+" '"+hash1_element+"'");
	  if( !hash1_element.names_match(hash2_element) ) {
	    result = "Found name difference between "+hash2_element_constructor.name+" '"+hash2_element+"' and "+hash1_element_constructor.name+" '"+hash1_element+"'";
	    if( common.argv.hasOwnProperty("dryrun") ) {
	      common.log(1,result);
	    }
	    else {
	      default_answer = common.get_answer(
		"Found name difference between "+hash2_element_constructor.name+" '"+hash2_element+"' and "+hash1_element_constructor.name+" '"+hash1_element+"' ("+difference.description+"). Fix it?",
		default_answer);
	      if( default_answer=='y' ) {
		if( (result=hash2_element.rename(hash1_element))=='' ) {
		  common.log(2,"Fixed name difference between "+hash2_element_constructor.name+" '"+hash2_element+"' and "+hash1_element_constructor.name+" '"+hash1_element+"'");
		}
		else {
		  common.log(2,"Cannot fix name difference between "+hash2_element_constructor.name+" '"+hash2_element+"' and "+hash1_element_constructor.name+" '"+hash1_element+"' ("+result+")");
		}
	      }
	    }
	  }
	  else {
	    common.log(4,hash2_element_constructor.name+" '"+hash2_element+"' has the same name as "+hash1_element_constructor.name+" '"+hash1_element+"'");
	  }
	}
	else {
	  common.log(2,"There are "+hash2_elements.length+" "+hash2_element_constructor.name+"s with timestamp '"+ts+"' corresponding to "+hash1_element_constructor.name+" '"+hash1_element+"'");
	}
      }
      else {
	common.log(2,"There are "+hash1_elements.length+" "+hash1_element_constructor.name+"s with timestamp '"+ts+"' ("+hash1_elements+")");
      }
    }
  }
}
