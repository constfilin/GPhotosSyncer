'use strict';

const common = require('./common');

class Cache {
    static make_sure_timeout_is_date( p ) {
        if( !(p.timestamp instanceof Date) ) {
            p.timestamp = new Date(p.timestamp);
        }
        return p;
    }
    constructor( storage ) {
        // If a filename was passed then we want to initialize by reading this JSON file
        this.storage = storage ? storage : {};
        this.size    = 0;
        for( let id in this.storage ) {
            this.storage[id] = this.constructor.make_sure_timeout_is_date(this.storage[id]);
            this.size++;
        }
    }
    get( id ) {
        return this.storage.hasOwnProperty(id) ? this.storage[id] : undefined;
    }
    add( item ) {
        if( this.storage.hasOwnProperty(item.id) ) {
            let s1 = String(this.storage[item.id]);
            let s2 = String(item);
            if( s1!=s2 ) {
                common.log(1,"Replacing '"+s1+"' with '"+s2+"'");
            }
        }
        else {
            this.size++;
        }
        this.storage[item.id] = this.constructor.make_sure_timeout_is_date(item);
        if( this.size%100==0 )
            common.log(3,"the number of items is "+this.size);
        return item;
    }
    del( id ) {
        if( !this.storage.hasOwnProperty(id) )
            return undefined;
        let item = this.storage[id];
        delete this.storage[id];
        this.size--;
        if( this.size%100==0 )
            common.log(3,"the number of items is "+this.size);
        return item;
    }
    rehash( hasher, put_same_keys_in_array ) {
        return Object.rehash(this.storage,hasher,put_same_keys_in_array);
    }
    map( mapper ) {
        return Object.map(this.storage,mapper);
    }
    filter( predicate ) {
        return Object.filter(this.storage,predicate);
    }
    // convenience methods
    grep_gpath( re ) {
        return this.filter(i=>(!i.gphotos_path||i.gphotos_path.match(re)));
    }
    grepv_gpath( re ) {
        return this.filter(i=>(!i.gphotos_path||(i.gphotos_path.match(re)==null)));
    }
    grep_exifdate( re ) {
        return this.filter(i=>(Date.toEXIFString(i.timestamp).match(re)));
    }
    grepv_gpath( re ) {
        return this.filter(i=>(Date.toEXIFString(i.timestamp).match(re)==null));
    }
    grep_exifMistmaches( re ) {
        return this.filter(i=>(Date.toEXIFString(i.timestamp).match(re) && (!i.gphotos_path || i.gphotos_path.indexOf(i.timestamp.getFullYear()+"_")!=0)));
    }
}

module.exports = Cache;
