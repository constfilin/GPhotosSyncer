"use strict";

/////////////////////////////////////////////////////////////////
// module globals
/////////////////////////////////////////////////////////////////
const util = require('util');

/////////////////////////////////////////////////////////////////
// adding to classes
/////////////////////////////////////////////////////////////////
Object.rehash = function( obj, hasher, put_same_keys_in_array ) {
    return Array.rehash(Object.values(obj),hasher,put_same_keys_in_array);
}
Object.filter = function( obj, predicate ) {
    let result = {};
    for( let key in obj ) {
        if( predicate(obj[key],key) ) 
            result[key] = obj[key];
    }
    return result;
}
Object.map = function( obj, mapper ) {
    let result = {};
    for( let key in obj ) {
        result[key] = mapper(obj[key],key);
    }
    return result;
}
Array.rehash = function( arr, hasher, put_same_keys_in_array ) {
    let result  = {};
    let common = module.exports;
    arr.forEach( (elem) => {
        let key = hasher(elem);
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
Date.toEXIFString = function( d ) {
    if( d.toString()=="Invalid Date" )
        return d.toString();
    let common = module.exports;
    return d.getFullYear()+":"+common.pad_number(d.getMonth()+1,2)+":"+common.pad_number(d.getDate(),2)+" "+
        common.pad_number(d.getHours(),2)+":"+common.pad_number(d.getMinutes(),2)+":"+common.pad_number(d.getSeconds(),2);
}
Date.fromEXIFString = function( es ) {
    let m;
    if( (m=String(es).match(/^([0-9]+):([0-9]{2}):([0-9]{2})[ \t]+([0-9]{2}):([0-9]{2}):([0-9]{2}).*$/i)) ) {
	      if( Number(m[2])==0 ) m[2] = 6; // If month is set to 0 incorrectly then default it to June
        return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]));
    }
    return new Date('Invalid Date');
}
Date.offset_to_value = function( s ) {
    if( s.indexOf("-")==0 )
        return 0-Date.offset_to_value(s.substr(1));
    const re    = /[0-9]+[dhms]/ig;
    const parts = s.match(re);
    if( parts.reduce((accumulator,p) => accumulator+p.length,0)!=s.length )
        return 0;
    return parts.reduce((accumulator,p) => {
        switch( p.substr(-1) ) {
        case 'd':
            return accumulator+(24*60*60*1000)*Number(p.substr(0,p.length-1));
        case 'h':
            return accumulator+(60*60*1000)*Number(p.substr(0,p.length-1));
        case 'm':
            return accumulator+(60*1000)*Number(p.substr(0,p.length-1));
        case 's':
            return accumulator+(1000)*Number(p.substr(0,p.length-1));
        default:
            return accumulator;
        }
    },0);    
}
Date.value_to_offset = function( value ) {
    if( value<0 )
        return "-"+Date.value_to_offset(0-value);
    let days  = Math.floor(value/(24*60*60*1000));
    value -= days*(24*60*60*1000);
    let hours = Math.floor(value/(60*60*1000));
    value -= hours*(60*60*1000);
    let minutes = Math.floor(value/(60*1000));
    value -= minutes*(60*1000);
    let seconds = Math.floor(value/(1000));
    return (days?(days+"d"):"")+(hours?(hours+"h"):"")+(minutes?(minutes+"m"):"")+seconds+"s";
}
/////////////////////////////////////////////////////////////////
// module exports
/////////////////////////////////////////////////////////////////
module.exports = {
    filesRoot         : "/media/cf/Passport500/public/Video",
    filesCache        : './files.json',
    gphotosCache      : './gphotos.json',
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
    get_difference( s1, s2, s1_name, s2_name ) {
        let result = {
            missing           : [],  // array of elements in s1 that we didn't find anywhere in s2
            same_gphotos_path : [],  // values are [s1 element,s2 element,timestamp_difference_in_hours]
        };
        const ms_in_hour  = 60*60*1000;
        const s2_by_gpath = Object.rehash(s2,i => i.gphotos_path.toLowerCase(),1);
        for( let k in s1 ) {
            let a1 = s1[k];
            if( s2.hasOwnProperty(k) ) {
                // same ID is among the other items, it does not get to the result
            }
            else {
                let a1_gpath = a1.gphotos_path.toLowerCase();
                if( s2_by_gpath.hasOwnProperty(a1_gpath) ) {
                    s2_by_gpath[a1_gpath].forEach( a2 => {
                        let timestamp_difference_in_hours = Math.round(((Math.abs(a2.timestamp.valueOf()-a1.timestamp.valueOf()))/ms_in_hour)*100)/100;
                        result.same_gphotos_path.push({
                            [s1_name] : a1,
                            [s2_name] : a2,
                            diff      : timestamp_difference_in_hours
                        });
                    });
                }
                else {
                    result.missing.push(a1);
                }
            }
        }
        result.same_gphotos_path = result.same_gphotos_path.sort((e1,e2)=>(e2.diff-e1.diff));
        return result;
    }
}
