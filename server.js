const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const csv = require('fast-csv');
const StatsManager = require('./scripts/stats').StatsManager;

const PORT = 8000;

var defaultMap, settings;
var users, logins, anyChanges, turnChangeTime;
var gameStarted;

var statsManager = new StatsManager();


function userAttemptAdminError(command) {
	console.log(`User attempted admin command ${command}`);
}

function makeError(error) {
	return {error: error};
}

function createUnit(units, loc, type, user, hp, delayed) {
    var id;
    if (units) {
        id = units[units.length - 1].id + 1;
    } else {
        id = 0;
    }
	var unit = {
		id: id,
		loc: loc,
		type: type,
		user: user,
		hp: hp
	};
    if (type == "Carrier") {
        unit.airfieldId = id+1000;
    }
	if (gameStarted && delayed) {
		unit.deployTime = parseInt(statsManager.getProperties(type)["Turns to Deploy"]);
	} else {
		unit.deployTime = 0;
	}

    var refuelTime = statsManager.getProperties(type)["Turns to refuel"];
    if (refuelTime != "n/a") {
        unit.fuelLeft = parseInt(refuelTime);
    }

	return unit;
}

function restrictMapView(mapJSON, user) {
	var units = [];

	for (var unit of mapJSON.units) {
		if (unit.user == user && unit.deployTime == 0) {
			units.push(unit);
			var range = statsManager.getProperties(unit.type)["Vision"]*1000;
			for (var unit2 of mapJSON.units) {
                if (unit2 != unit) {
    				var [unit1x, unit1y] = unit.loc;
    				var [unit2x, unit2y] = unit2.loc;
    				if (Math.hypot(unit1x-unit2x, unit1y-unit2y) <= range && unit2.deployTime == 0) {
    					units.push(unit2);
    				}
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

function startGame() {
	gameStarted = true;
	turnChangeTime[users[0]] = (new Date()).getTime() + settings.turnTime;
	turnChangeTime[users[1]] = (new Date()).getTime() + settings.turnTime * 2;
}

function getAirfieldById(mapJSON, airfieldId) {
	for (var airfield of mapJSON.airfields) {
		if (airfield.id == airfieldId) {
			return airfield;
		}
	}
	return null;
}

function moveAirfield(mapJSON, airfieldId, loc) {
	getAirfieldById(mapJSON, airfieldId).loc = loc;
}

function attemptMove(mapJSON, id, newLocation) {
	changeOccured();
	for (var unit of mapJSON.units) {
		if (unit.id == id) {
            if (unit.type == "Carrier") {
                moveAirfield(mapJSON, unit.airfieldId, newLocation);
            }
            unit.loc = newLocation;
			return;
		}
	}
	console.log(`Invalid move made: id ${id} not found`);
}

function exitAirfield(mapJSON, airfieldId, unitId) {
	changeOccured();
	var airfield = getAirfieldById(mapJSON, airfieldId);
	var unitToDelete = -1;
	for (var unitId_ in airfield.units) {
		var unit = airfield.units[unitId_];
		if (unit.id == unitId) {
			unitToDelete = unit;
			mapJSON.units.push(createUnit(mapJSON.units, airfield.loc, unit.type, unit.user, unit.hp, false));
			break;
		}
	}
	if (unitToDelete == -1) {
		console.log(`Invalid unit (${unitId}) deletion from airfield ${airfieldId}`);
	} else {
		deleteUnit(airfield, unitToDelete.id)
	}
}

function hasCompatAirfieldAffil(airfield, user) {
    if (airfield.units.length == 0) {
        return true;
    } else {
        return airfield.units[0].user == user;
    }
}

function getNearestAirfield(mapJSON, unit) {
    var user = unit.user;
    var loc = unit.loc;
    var airfieldFound = false;
    var searchRadius = 0;
    var closestAirfield = null;
    var closestAirfieldDistance = null;
    for (var airfield of mapJSON.airfields) {
        if (hasCompatAirfieldAffil(airfield, user)) {
            var d = Math.hypot(airfield.loc[0] - loc[0], airfield.loc[1] - loc[1]);
            if (closestAirfieldDistance == null || d < closestAirfieldDistance) {
                closestAirfield = airfield;
                closestAirfieldDistance = d;
            }
        }
    }
    return closestAirfield;
}


function returnToAirfield(mapJSON, unitId) {
    var unit = getUnitById(mapJSON.units, unitId);
	var airfield = getNearestAirfield(mapJSON, unit);
	if (airfield != null){
        unit.loc = null;
		changeOccured();
		deleteUnit(mapJSON, unitId);
		airfield.units.push(unit);
	} else {
		console.log(`Failed return to airfield as no airfield was found`);
		changeOccured();
		deleteUnit(mapJSON, unitId);
	}
}

function deleteUnit(unitContainer, id) {
	unitContainer.units = unitContainer.units.filter(u => u.id != id);
}

function handleSync(reqBody, mapJSON) {
	var changes = reqBody.changes;
	var response = new Object();
	response.notifications = notifications[reqBody.username];
	notifications[reqBody.username] = [];
	if (reqBody.username == "admin" || changes.length==0) {
		for (var change of changes) {
			// Admin changes
			switch (change.type) {
				case "add":
					changeOccured();
					mapJSON.units.push(createUnit(mapJSON.units, change.loc, change.unitType, change.user, 100, true));
					adminNotification(`Added a ${change.unitType} for ${change.user}`);
					break;
				case "move":
					attemptMove(mapJSON, change.unitId, change.newLocation);
					break;
				case "delete":
					changeOccured();
					var unit = getUnitById(mapJSON.units, change.unitId);
					if (unit == null) {
						console.log(`Invalid delete made: id ${change.unitId} not found`);
					} else {
						deleteUnit(mapJSON, change.unitId);
					}
					break;
				case "setTurnTime":
					settings.turnTime = change.time*1000;
					break;
				case "startTurnChanging":
					mapJSON.gameStarted = true;
					startGame();

					break;
				case "reset":
					fs.copyFile('data/map.json', 'data/backup-map.json', (err) => {
						if (err) throw err;
					});
					defaultMap = fs.readFileSync('default-map.json');
					defaultMapJSON = JSON.parse(defaultMap);
					mapJSON = defaultMapJSON;
					updateTurnChangeTimeFromFile(mapJSON.turnChangeTime);
					gameStarted = mapJSON.gameStarted;
					init()
					break;
				case "returnToAirfield":
					returnToAirfield(mapJSON, change.unitId);
					break;
				case "exitAirfield":
					exitAirfield(mapJSON, change.airfieldId, change.unitId);
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`);
			}
		}
		updateTurnChangeTimeInFile(mapJSON.turnChangeTime);
		var mapRaw = JSON.stringify(mapJSON);

		response.turnTime = settings.turnTime;
		response.anyChanges = anyChanges[reqBody.username];
		response.usersList = users;

		if (firstSync[reqBody.username] || reqBody.firstSync) {
			firstSync[reqBody.username] = false;
			response.anyChanges = true;
			response.statsData = statsManager.getData();
		}

		if (reqBody.username == "admin") {
			response.mapState = mapJSON;
		} else {
			checkForMissingUsers(mapJSON);
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

function advanceTurnTimer(mapJSON, offset) {
	var previousUser;

	if (offset === undefined) {
		offset = 0;
	}
	var usersCount = users.length;
	var nextUser = getNextTurnUser();

	for (var unit of mapJSON.units) {
		if (unit.user == nextUser) {
            if (unit.deployTime > 0) {
    			unit.deployTime--;
    			if (unit.deployTime == 0) {
    				anyChanges[nextUser] = true;
    			}
            }
            if (unit.fuelLeft != null) {
                if (unit.fuelLeft == 0) {
                    addNotification([notifications[unit.user]], `A ${unit.type} was returned to the nearest airfield.`);
                    returnToAirfield(mapJSON, unit.id)
                }
                unit.fuelLeft -= 1;
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
	updateTurnChangeTimeInFile(mapJSON.turnChangeTime);
}

function checkForMissingUsers(mapJSON) {
	if (gameStarted) {
		var t = (new Date()).getTime();
		var u = getNextTurnUser();
		if (turnChangeTime[u] + 2000 < t){
			advanceTurnTimer(mapJSON, -2000);
		}
	}
}

function getLastTurnUser() {
	if (!gameStarted) {
		return "";
	}
	var lastUser = users[0];
	for (var u of users) {
		if (turnChangeTime[u] > turnChangeTime[lastUser]) {
			lastUser = u;
		}
	}
	return lastUser;
}

function getNextTurnUser() {
	if (!gameStarted) {
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

function attemptAttack(attacker, defender) {
	var dodgeChance = statsManager.getDodgeChance(attacker.type, defender.type);
	if (Math.random()*100>=dodgeChance) {
		defender.hp -= statsManager.getAttackStrength(attacker.type, defender.type);
		attacker.hp -= statsManager.getDefenceStrength(attacker.type, defender.type);
		return true;
	} else {
		return false;
	}
}

function advanceGameTime(mapJSON) {
    mapJSON["currentTime"] += 1;
}

function addNotification(lists, message) {
	adminNotification(message);
	for (var list of lists) {
		list.push(message);
	}
}
function adminNotification(message) {
	notifications["admin"].push(`[${getLastTurnUser()}] `+message);
}


function handleTurnChange(reqBody, mapJSON) {
	var nextUser = getNextTurnUser();
	var isCorrectTurn = reqBody.username == nextUser;
	var response = new Object();
	if (isCorrectTurn) {
        if (nextUser == users[users.length-1]) {
            advanceGameTime(mapJSON);
        }
		var d = new Date();
		advanceTurnTimer(mapJSON, 0);
		var changes = reqBody.changes;
		response.notifications = notifications[reqBody.username];
		notifications[reqBody.username] = [];
		for (var change of changes) {
			// User changes
			let unit;
			switch (change.type) {
				case "move":
					attemptMove(mapJSON, change.unitId, change.newLocation);
					break;
				case "attack":
					changeOccured();
					var attacker = getUnitById(mapJSON.units, change.attackerId);
					var defender = getUnitById(mapJSON.units, change.defenderId);
                    if (attacker == null || defender == null) {
                        addNotification([response.notifications, notifications[defender.user]], `Attacking ${attacker.type} missed the defending ${defender.type}.`);
                    } else if (!attemptAttack(attacker, defender)) {
						addNotification([response.notifications, notifications[defender.user]], `Attacking ${attacker.type} missed the defending ${defender.type}.`);
					} else {
						if (attacker.hp <= 0) {
							deleteUnit(mapJSON, change.attackerId);
							addNotification([response.notifications, notifications[defender.user]], `Attacking ${attacker.type} was killed by the defending ${defender.type}.`);
						}
						if (defender.hp <= 0) {
							deleteUnit(mapJSON, change.defenderId);
							addNotification([response.notifications, notifications[defender.user]], `Attacking ${attacker.type} killed the defending ${defender.type}.`);
						}
					}
					break;
				case "returnToAirfield":
					unit = getUnitById(mapJSON.units, change.unitId);
					returnToAirfield(mapJSON, change.unitId);
					addNotification([response.notifications], `A ${unit.type} was returned to the nearest airfield.`);
					break;
				case "exitAirfield":
					unit = getUnitById(getAirfieldById(mapJSON, change.airfieldId).units, change.unitId);
					exitAirfield(mapJSON, change.airfieldId, change.unitId);
					addNotification([response.notifications], `A ${unit.type} exited its airfield.`);
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`);
			}
		}
		updateTurnChangeTimeInFile(mapJSON.turnChangeTime);
		var mapRaw = JSON.stringify(mapJSON);
		checkForMissingUsers(mapJSON);
		response.nextTurnChange = turnChangeTime[reqBody.username];
		response.turnTime = isCorrectTurn;
		response.anyChanges = anyChanges[reqBody.username];
		response.usersList = users;
		if (reqBody.username == "admin") {
			response.mapState =  mapJSON;
		} else {
			response.mapState = restrictMapView(mapJSON, reqBody.username);
		}
		// console.log(`time: ${(new Date()).getTime()}, test1: ${turnChangeTime.test1}, test2: ${turnChangeTime.test2}`);

		fs.writeFileSync('data/map.json', mapRaw);
	} else {
		console.log(`Out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser} at time ${(new Date()).getTime()}`);
		// response = makeError(`out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser}`)
		response.mapState = restrictMapView(mapJSON);
		response.nextTurnChange = turnChangeTime[reqBody.username];
		response.isCorrectTurn = isCorrectTurn;
		response.anyChanges = anyChanges[reqBody.username];

		if (reqBody.username == "admin") {
			response.usersList = users;
		}
	}
	return response;
}

function changeOccured() {
	for (var key in anyChanges) {
		anyChanges[key] = true
	}
}

function init() {
	for (user of users) {
		anyChanges[user] = true;
		firstSync[user] = true;
		notifications[user] = [];
	}
}

function updateTurnChangeTimeInFile(times) {
	for (user of users) {
		if (turnChangeTime[user] == 0) {
			times[user] = 0;
		} else {
			times[user] = turnChangeTime[user] - (new Date()).getTime();
		}
	}
}

function updateTurnChangeTimeFromFile(times) {
	for (user of users) {
		if (times[user] == 0) {
			turnChangeTime[user] = 0;
		} else {
			turnChangeTime[user] = (new Date()).getTime() + times[user];
		}
	}
}


users = ["Blufor", "Opfor"];
logins = {	"admin":    "",
		    [users[0]]: "",
		    [users[1]]: ""};
anyChanges = {"admin": true};
turnChangeTime = {};
firstSync = {"admin": true};
notifications = {"admin": []};

init()


// File reading

settings = JSON.parse(fs.readFileSync('settings.json'));


if (!fs.existsSync("data")) {
  fs.mkdirSync("data");
}

if (fs.existsSync("data/map.json")) {
	let mapJSON = JSON.parse(fs.readFileSync('data/map.json'));
	gameStarted = mapJSON.gameStarted;
	updateTurnChangeTimeFromFile(mapJSON.turnChangeTime);
} else {
	defaultMapRaw = fs.readFileSync('default-map.json');
	let defaultMap = JSON.parse(defaultMapRaw)
	gameStarted = defaultMap.gameStarted;
	updateTurnChangeTimeFromFile(defaultMap.turnChangeTime);
	fs.writeFileSync('data/map.json', defaultMapRaw);
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
