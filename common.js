"use strict";

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const util              = require('util');
const exiftool_vendored = require('exiftool-vendored');  

/////////////////////////////////////////////////////////////////
// classes
/////////////////////////////////////////////////////////////////
class EXIFDate extends Date {
  constructor( year, month, date, hour, minute, second ) {
    if( year instanceof Date ) {
      super(year);
    }
    else {
      super(year,month,date,hour,minute,second);
    }
  }
  toEXIFString() {
    let common = module.exports;
    return this.getFullYear()+":"+common.pad_number(this.getMonth()+1,2)+":"+common.pad_number(this.getDate(),2)+" "+
      common.pad_number(this.getHours(),2)+":"+common.pad_number(this.getMinutes(),2)+":"+common.pad_number(this.getSeconds(),2);
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
// 
/////////////////////////////////////////////////////////////////
Array.prototype.toHash = function( hashing_proc, put_same_keys_in_array ) {
  let result  = {};
  let common = module.exports;
  this.forEach( (elem) => {
    let key = hashing_proc(elem);
    if( put_same_keys_in_array ) {
      if( !result.hasOwnProperty(key) ) {
	result[key] = [];
      }
      result[key].push(elem);
    }
    else {
      if( !result.hasOwnProperty(key) ) {
	result[key] = elem;
      }
      else {
	common.log(3,"Hash already has key '"+key+"', leaving the old value");
      }
    }
  });
  return result;
}
/////////////////////////////////////////////////////////////////
// module exports
/////////////////////////////////////////////////////////////////
module.exports = {
  imagesRoot  : "/media/WDPASSPORT/public/Video",
  imagesCache : './allimages.json',
  photosCache : './allphotos.json',
  exiftool    : exiftool_vendored.exiftool,
  exiftool_dt : exiftool_vendored.ExifDateTime,
  'EXIFDate'  : EXIFDate,
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
    return String(n).padStart(max_length,"0");
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
    let result = require('readline-sync').question(prompt+' (default is '+default_answer+'): ');
    return (result=='') ? default_answer : result;    
  },
  subtract_items( a1, a2 ) {
    let result = [];
    const ms_in_hour = 60*60*1000;
    const common     = module.exports;
    const by_id1     = a1.toHash(i => i.id);
    const by_id2     = a2.toHash(i => i.id);
    const by_title2  = a2.toHash(i => i.title.toLowerCase(),true);
    for( let k in by_id1 ) {
      let a1 = by_id1[k];
      if( by_id2.hasOwnProperty(k) ) {
	// same ID is among the other items, it does not get to the result
      }
      else {
	let a1_title = a1.title.toLowerCase();
	if( by_title2.hasOwnProperty(a1_title) ) {
	  // Let see if there is an identically titled item in a2 with timestamp
	  // "close enough" to the timestamp of item in a1
	  let search_results = by_title2[a1_title].reduce( (accumulator,element) => {
	    let diff = Math.abs(element.timestamp.valueOf()-a1.timestamp.valueOf());
	    return (diff<accumulator.diff)? {'diff':diff,'element':element} : accumulator;
	  },{'diff':Number.POSITIVE_INFINITY,'element':undefined});
	  if( search_results.diff<12*ms_in_hour ) {
	    // this is "close enough"
	  }
	  else if( search_results<24*ms_in_hour ) {
	    common.log(2,"Found items with title '"+a1_title+"' but with timestamps different by "+(Math.abs(i.timestamp.valueOf()-a1.timestamp.valueOf())/1000)+" seconds");
	  }
	  else {
	    // Have the same title but too different timestamps
	    a1.closest_match = search_results.element;
	    result.push(a1);
	  }
	}
	else {
	  // Don't even have the same title
	  result.push(a1);
	}
      }
    }
    return result;
  }
}
