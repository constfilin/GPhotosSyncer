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
  hash_diff( h1, h2 ) {
    let result = {};
    for( let k in h1 ) {
      if( !h2.hasOwnProperty(k) ) {
	result[k] = h1[k];
      }
    }
    return result;
  }
}
