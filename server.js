const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const csv = require('fast-csv');

const PORT = 8000;

var defaultMap, settings;
var users, logins, anyChanges, turnChangeTime;
var unitTypes;
var deploymentPhaseActive = true;


function userAttemptAdminError(command) {
	console.log(`User attempted admin command ${command}`);
}

function makeError(error) {
	return {error: error};
}

function createUnit(id, loc, type, user) {
	var unit = {
		id: id,
		loc: loc,
		type: type,
		user: user,
		properties: unitTypes[type]
	};
	if (!deploymentPhaseActive) {
		unit.deployTime = parseInt(unit.properties["Turns to Deploy"]);
	} else {
		unit.deployTime = 0;
	}
	return unit;
}

function restrictMapView(mapJSON, user) {
	var units = [];

	for (var unit of mapJSON.units) {
		if (unit.user == user && unit.deployTime == 0) {
			units.push(unit);
			var range = unit.properties["Vision"]*1000;
			for (var unit2 of mapJSON.units) {
				var [unit1x, unit1y] = unit.loc;
				var [unit2x, unit2y] = unit2.loc;
				if (Math.hypot(unit1x-unit2x, unit1y-unit2y) <= range && unit2.deployTime == 0) {
					units.push(unit2);
				}
			}
		}
	}

	mapJSON.units = units;
	return mapJSON;
}

function getUnitById(units, id) {
	for (var unit of units) {
		if (unit.id == id) {
			return unit;
		}
	}
	return null;
}

function handleSync(reqBody, mapJSON) {
	var changes = reqBody.changes;
	if (reqBody.username == "admin" || changes.length==0) {
		for (var change of changes) {
			switch (change.type) {
				case "add":
					var id;
					changeOccured();
					if (mapJSON.units) {
						id = mapJSON.units[mapJSON.units.length - 1].id + 1;
					} else {
						id = 0;
					}

					mapJSON.units.push(createUnit(id, change.loc, change.unitType, change.user));

					break;
				case "move":
					changeOccured();
					var id = change.unitId;
					var newLocation = change.newLocation;
					move: {
						for (var unit of mapJSON.units) {
							if (unit.id == id) {
								unit.loc = newLocation;
								break move;
							}
						}
						console.log(`Invalid move made: id ${id} not found`);
					}
					break;
				case "delete":
					changeOccured();
					var unit = getUnitById(mapJSON.units, change.unitId);
					if (unit == null) {
						console.log(`Invalid delete made: id ${change.unitId} not found`);
					} else {
						mapJSON.units = mapJSON.units.filter(u => u.id != change.unitId);
					}
					break;
				case "setTurnTime":
					settings.turnTime = change.time*1000;
					break;
				case "startTurnChanging":
					deploymentPhaseActive = false;
					turnChangeTime[users[0]] = (new Date()).getTime() + settings.turnTime;
					turnChangeTime[users[1]] = (new Date()).getTime() + settings.turnTime * 2;
					break;
				case "reset":
					fs.copyFile('data/map.json', 'data/backup-map.json', (err) => {
						if (err) throw err;
					});
					defaultMap = fs.readFileSync('default-map.json');
					defaultMapJSON = JSON.parse(defaultMap);
					mapJSON = defaultMapJSON;
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`);
			}
		}

		var mapRaw = JSON.stringify(mapJSON);
		response = {
			turnTime: settings.turnTime,
			anyChanges: anyChanges[reqBody.username],
			usersList: users
		};

		if (reqBody.username == "admin") {
			response.unitTypes = Object.keys(unitTypes);
			response.mapState = mapJSON;
		} else {
			checkForMissingUsers();
			response.mapState = restrictMapView(mapJSON, reqBody.username);
			response.nextTurnChange = turnChangeTime[reqBody.username];
			response.isCorrectTurn = getNextTurnUser() == reqBody.username;
		}

		// console.log(`time: ${(new Date()).getTime()}, Blufor: ${turnChangeTime[users[0]]}, Opfor: ${turnChangeTime[users[1]]}`)

		fs.writeFileSync('data/map.json', mapRaw);
	} else {
		userAttemptAdminError(change.type);
		response = makeError("Error: User attempted admin move");
	}
	return response;
}

function advanceTurnTimer(offset, units) {
	var previousUser;

	if (offset === undefined) {
		offset = 0;
	}
	var usersCount = users.length;
	var nextUser = getNextTurnUser();

	for (var unit of units) {
		if (unit.user == nextUser && unit.deployTime > 0) {
			unit.deployTime--;
			if (unit.deployTime == 0) {
				anyChanges[nextUser] = true;
			}
		}
	}

	var nextUserIndex = users.indexOf(nextUser);

	var i = (nextUserIndex+1) % usersCount;
	turnChangeTime[users[i]] = (new Date()).getTime()+parseInt(settings.turnTime) + offset;

	while (i != nextUserIndex) {
		previousUser = users[i];
		i = (i+1) % usersCount;
		turnChangeTime[users[i]] = turnChangeTime[previousUser]+parseInt(settings.turnTime);
	}
}

function checkForMissingUsers(units) {
	if (!deploymentPhaseActive) {
		var t = (new Date()).getTime();
		var u = getNextTurnUser();
		if (turnChangeTime[u] + 2000 < t){
			advanceTurnTimer(-2000, units);
		}
	}
}

function getNextTurnUser() {
	if (deploymentPhaseActive) {
		return "";
	}

	var nextUser = users[0];
	for (var u of users) {
		if (turnChangeTime[u] < turnChangeTime[nextUser]) {
			nextUser = u;
		}
	}
	return nextUser;
}

function handleTurnChange(reqBody, mapJSON) {
	var nextUser = getNextTurnUser();
	var isCorrectTurn = reqBody.username == nextUser;
	if (isCorrectTurn) {
		var d = new Date();
		advanceTurnTimer(0, mapJSON.units);
		var changes = reqBody.changes;
		for (var change of changes) {
			switch (change.type) {
				case "move":
					changeOccured();
					var id = change.unitId;
					var newLocation = change.newLocation;
					move: {
						for (var unit of mapJSON.units) {
							if (unit.id == id) {
								unit.loc = newLocation;
								break move;
							}
						}
						console.log(`Invalid move made: id ${id} not found`);
					}
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`);
			}
		}

		var mapRaw = JSON.stringify(mapJSON);
		checkForMissingUsers(mapJSON.units);
		response = {
			nextTurnChange: turnChangeTime[reqBody.username],
			turnTime: isCorrectTurn,
			anyChanges: anyChanges[reqBody.username],
			usersList: users
		};
		if (reqBody.username == "admin") {
			response.mapState =  mapJSON;
			response.unitTypes = Object.keys(unitTypes);
		} else {
			response.mapState = restrictMapView(mapJSON, reqBody.username);
		}
		// console.log(`time: ${(new Date()).getTime()}, test1: ${turnChangeTime.test1}, test2: ${turnChangeTime.test2}`);

		fs.writeFileSync('data/map.json', mapRaw);
	} else {
		console.log(`Out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser} at time ${(new Date()).getTime()}`);
		// response = makeError(`out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser}`)
		response = {
			mapState: restrictMapView(mapJSON),
			nextTurnChange: turnChangeTime[reqBody.username],
			isCorrectTurn: isCorrectTurn,
			anyChanges: anyChanges[reqBody.username]
		};
		if (reqBody.username == "admin") {
			response.unitTypes = Object.keys(unitTypes);
			response.usersList = users;
		}
	}
	return response;
}


users = ["Blufor", "Opfor"];

logins = {
    "admin": "",
    [users[0]]: "",
    [users[1]]: ""
};

anyChanges = {
	"admin": true,
	[users[0]]: true,
	[users[1]]: true,
};

turnChangeTime = {
	[users[0]]: 0,
	[users[1]]: 0
};

function changeOccured() {
	for (var key in anyChanges) {
		anyChanges[key] = true
	}
}

// File reading

settings = JSON.parse(fs.readFileSync('settings.json'));

unitTypes = new Object();

function addUnitType(object) {
	var type = object["Unit Type"]
	unitTypes[type] = object
	delete unitTypes[type]["Unit Type"]
}

csv
  .parseFile('./stats.csv', {headers: true})
  .on('error', error => console.error(error))
  .on('data', row => addUnitType(row));


if (!fs.existsSync("data")) {
  fs.mkdirSync("data");
}

if (!fs.existsSync("data/map.json")) {
	defaultMap = fs.readFileSync('default-map.json');
	fs.writeFileSync('data/map.json', defaultMap);
}

app.use(express.static('dist'));
app.use(bodyParser.json());

app.use('/res', express.static('res'));

app.post('/server.js', function (req, res, next) {
	var rawdata = fs.readFileSync('data/map.json');
	var mapJSON = JSON.parse(rawdata);
	var username = req.body.username;
	if (logins[username] == req.body.password) {
		var response;
		if (req.body.requestType == "sync") {
			response = handleSync(req.body, mapJSON);
		} else if (req.body.requestType == "turnChange") {
			response = handleTurnChange(req.body, mapJSON);
		} else {
			console.log(`Invalid request made: ${req.body.requestType}`);
			response = makeError("Invalid request made");
		}
	} else  {
		console.log(`Incorrect password for user, ${username}, entered`);
		response = makeError("Wrong password");
	}
	res.send(JSON.stringify(response));
	anyChanges[username] = false;
	next();
})

app.listen(PORT);
