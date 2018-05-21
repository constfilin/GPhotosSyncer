'use strict';

const common = require('./common');

class BunchOfPromises {
    constructor() {
        this.promises = [];
        this.resolved = 0;
        this.rejected = 0;
    }
    toString() {
        if( common.loglevel>3 ) 
            return "total="+this.promises.length+",resolved="+this.resolved+",rejected="+this.rejected+",pending="+(this.promises.length-this.resolved-this.rejected);
        return "total="+this.promises.length+",pending="+(this.promises.length-this.resolved-this.rejected)+(this.rejected?(",rejected="+this.rejected):"");
    }
    add( promise ) {
        return this.promises.push(promise);
    }
    reject( rejector, err ) {
        this.rejected++;
        return rejector(err);
    }
    resolve( resolver, result ) {
        this.resolved++;
        return resolver(result);
    }
}

module.exports = BunchOfPromises;
