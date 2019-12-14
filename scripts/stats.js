const csv = require('fast-csv');


function readData(sM) {
	csv
		.parseFile('./stats.csv', {headers: true})
		.on('error', error => console.error(error))
		.on('data', row => addUnitType(sM, row));
	csv
		.parseFile('./attackStats.csv', {headers: true})
		.on('error', error => console.error(error))
		.on('data', row => addConflictStat(sM, 'attack', row));
	csv
		.parseFile('./defenceStats.csv', {headers: true})
		.on('error', error => console.error(error))
		.on('data', row => addConflictStat(sM, 'defence', row));
	csv
		.parseFile('./dodgeStats.csv', {headers: true})
		.on('error', error => console.error(error))
		.on('data', row => addConflictStat(sM, 'dodge', row));
}

function addUnitType(sM, object) {
	var type = object["Unit Type"];
	sM.unitTypes[type] = object;
	delete sM.unitTypes[type]["Unit Type"];
}

function addConflictStat(sM, statType, row) {
	var mainType = row["Unit Type"];
	if (!sM.conflictStats[mainType]) {
		sM.conflictStats[mainType] = {};
	}
	stats = sM.conflictStats[mainType];
	for (var otherType in row) {
		if (otherType != "Unit Type") {
			if (!stats[otherType]) {
				stats[otherType] = {};
			}
			stats[otherType][statType] = row[otherType];
		}
	}
}


class StatsManager {
	constructor(data) {
		this.unitTypes = {};
		this.conflictStats = {};

		if (data==undefined) {
			readData(this);
	  	} else {
			this.unitTypes = data.unitTypes;
			this.conflictStats = data.conflictStats;
		}
	}

	getProperties(unitType) {
		return this.unitTypes[unitType];
	}

	getTypes() {
		return Object.keys(this.unitTypes);
	}

	getData() {
		return {
			unitTypes: this.unitTypes,
			conflictStats: this.conflictStats
		};
	}

	getAttackStrength(attackerType, defenderType) {
		let s;
		if (this.conflictStats[attackerType] !== undefined) {
			s = this.conflictStats[attackerType][defenderType];
		} else {
			return 0;
		}
		let v;
		if (s == null) {
			v = 0;
		} else if (s["attack"] == null) {
			v= 0;
		} else {
			v = s["attack"];
		}
		return v;
	}

	getDefenceStrength(attackerType, defenderType) {
		let s;
		if (this.conflictStats[attackerType] !== undefined) {
			s = this.conflictStats[attackerType][defenderType];
		} else {
			return 0;
		}
		var v;
		if (s == null) {
			v = 0;
		} else if (s["defence"] == null) {
			v= 0;
		} else {
			v = s["defence"];
		}
		return v;
	}

	getDodgeChance(attackerType, defenderType) {
		let s;
		if (this.conflictStats[attackerType] !== undefined) {
			s = this.conflictStats[attackerType][defenderType];
		} else {
			return 0;
		}
		var v;
		if (s == null) {
			v = 0;
		} else if (s["dodge"] == null) {
			v= 0;
		} else {
			v = s["dodge"];
		}
		return v;
	}
}


(function() {
	module.exports.StatsManager = StatsManager;
}());
