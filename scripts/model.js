function roundLocation(loc) {
	return [Math.round(loc[0]/1000)*1000, Math.round(loc[1]/1000)*1000];
}
function roundLocationBy(loc, amount) {
	return [Math.round(loc[0]/amount)*amount, Math.round(loc[1]/amount)*amount];
}


class Unit {
	constructor(loc, id, type, user, deployTime, fuelLeft, hp, properties) {
		this.loc = loc;
		this.type = type;
		this.user = user;
		this.properties = properties;
		this.moveFeature = null;
		this.attackFeature = null;
		this.seen = false;
		this.deployTime = deployTime;
		this.moveDistance = 0.0;
		this.visualLoc = roundLocation(loc);
		this.hp = hp;
        this.feature = null;
        this.fuelLeft = fuelLeft;
	}

    setFeature(feature) {
        this.feature = feature;
    }

	toRaw() {
		return {
			id: this.feature.getId(),
			loc: this.loc,
			type: this.type,
			user: this.user,
			properties: this.properties,
			deployTime: this.deployTime,
			hp: this.hp
		};
	}

	get id() {
		return this.feature.getId();
	}

	updateZoom(gridWidth, geo){
		this.feature.setGeometry(new geo(this.loc));
		this.visualLoc = roundLocationBy(this.loc, gridWidth);
	}
}


class Model {
    constructor() {
        this.units = [];
        this.airfields = [];
        this.usersList = [];
    }

    addUnit(rawUnit, properties) {
    	var unit;
    	var originalUnit = this.getUnitById(rawUnit.id);
        var id = rawUnit.id;

    	if (id == undefined) {
    		if (this.units) {
    			id = this.units[units.length-1].id+1;
    		} else {
    			id = 0;
    		}
    	}

    	var loc = roundLocation(rawUnit.loc);

    	if (originalUnit != null) {
    		unit = originalUnit;
    		unit.loc = loc;
    		unit.deployTime = rawUnit.deployTime;
            unit.fuelLeft = rawUnit.fuelLeft;
    		unit.hp = rawUnit.hp;
    	} else {
    		unit = new Unit(loc, id, rawUnit.type, rawUnit.user, rawUnit.deployTime, rawUnit.fuelLeft, rawUnit.hp, properties);
    		this.units.push(unit);
    	}

        if (rawUnit.type == "Carrier") {
            unit.airfieldId = rawUnit.airfieldId;
        }

    	unit.seen = true;
    	return unit;
    }

    addAirfield(rawAirfield) {
        this.airfields.push(rawAirfield)
    }

    removeUnseenUnits() {
        for (var unit of this.units) {
            if (!unit.seen) {
                this.units.splice(this.units.indexOf(unit), 1);
            }
        }
    }

    getUnitFromFeature(feature) {
    	for (var unit of this.units) {
    		if (unit.feature == feature) {
    			return unit;
    		}
    	}
    	throw "Can't find unit with requested feature";
    }

    getUnitById(id) {
    	for (var unit of this.units) {
    		if (unit.id == id) {
    			return unit;
    		}
    	}
    	return null;
    }

    getAirfieldById(id) {
    	for (var airfield of this.airfields) {
    		if (airfield.id == id) {
    			return airfield;
    		}
    	}
    	return null;
    }
    resetUnitSight() {
        for (var unit of this.units) {
            unit.seen = false;
        }
    }
    removeUnit(unit) {
    	this.units = this.units.filter(u => u.id != unit.id);
    }
}



(function() {
	module.exports.Model = Model;
}());
