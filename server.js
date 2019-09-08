const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const app = express()
const port = 8000


function userAttemptAdminError(command) {
	console.log(`User attempted admin command ${command}`)
}

function makeError(error) {
	return {error: error}
}

function handleSync(reqBody, mapJSON) {
	var changes = reqBody.changes
	if (reqBody.username == "admin" || changes.length==0) {
		for (var change of changes) {
			switch (change.type) {
				case "add":
					var id
					if (mapJSON.units) {
						id = mapJSON.units[mapJSON.units.length-1].id+1
					} else {
						id = 0
					}
					change.unit.id = id
					mapJSON.units.push(change.unit)

					break;
				case "move":
					var id = change.unitId;
					var newLocation = change.newLocation;
					move: {
						for (var unit of mapJSON.units) {
							if (unit.id == id) {
								unit.loc = newLocation
								break move
							}
						}
						console.log(`Invalid move made: id ${id} not found`)
					}
					break;
				case "setTurnTime":
					settings.turnTime = change.time*1000
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`)
			}
		}

		var mapRaw = JSON.stringify(mapJSON)
		response = {
			mapState: mapJSON,
			turnTime: settings.turnTime
		}
		if (reqBody.username != "admin") {
			checkForMissingUsers()
			response.nextTurnChange = turnChangeTime[reqBody.username]
		}

		fs.writeFileSync('data/map.json', mapRaw)
	} else {
		userAttemptAdminError(change.type)
		response = makeError("Error: User attempted admin move")
	}
	return response
}

function increaseTurnTimer(u) {
	var usersCount = Object.keys(users).length
	var previousUser = users[(users.indexOf(u)-1+usersCount) % usersCount]
	turnChangeTime[u] = turnChangeTime[previousUser]+settings.turnTime
}

function checkForMissingUsers() {
	var t = (new Date()).getTime()
	for (var u in turnChangeTime) {
		if (turnChangeTime[u] + 2000 < t) {
			increaseTurnTimer(u)
		}
	}
}

function getNextTurnUser() {
	var nextUser = Object.keys(turnChangeTime)[0]
	var t = (new Date()).getTime()
	for (var u in turnChangeTime) {
		if (turnChangeTime[u] < turnChangeTime[nextUser]) {
			nextUser = u
		}
	}
	return nextUser
}

function handleTurnChange(reqBody, mapJSON) {
	// console.log("Starting turn change")
	var nextUser = getNextTurnUser()
	if (reqBody.username == nextUser) {
		var d = new Date()
		increaseTurnTimer(reqBody.username)
		var changes = reqBody.changes
		for (var change of changes) {
			switch (change.type) {
				case "move":
					var id = change.unitId;
					var newLocation = change.newLocation;
					move: {
						for (var unit of mapJSON.units) {
							if (unit.id == id) {
								unit.loc = newLocation
								break move
							}
						}
						console.log(`Invalid move made: id ${id} not found`)
					}
					break;
				default:
					console.log(`Unusual change requested: ${change.type}`)
			}
		}

		var mapRaw = JSON.stringify(mapJSON)
		checkForMissingUsers()
		response = {
			mapState: mapJSON,
			nextTurnChange: turnChangeTime[reqBody.username],
			turnTime: settings.turnTime
		}

		fs.writeFileSync('data/map.json', mapRaw)
	} else {
		console.log(`Out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser}`)
		response = makeError(`out of turn - turn change. user: ${reqBody.username}. next user: ${nextUser}`)
	}
	return response
}


var d = new Date()

var users = ["test1", "test2"]

var logins = {
    "admin": "hopefully this doesnt need to be secure",
    [users[0]]: "user test password",
    [users[1]]: "user test2 password"
}

var settings = JSON.parse(fs.readFileSync('settings.json'))

var turnChangeTime = {
	[users[0]]: d.getTime()+settings.turnTime,
	[users[1]]: d.getTime()+settings.turnTime*2
}


var defaultMap = fs.readFileSync('default-map.json')
if (!fs.existsSync("data")) {
	fs.mkdirSync("data")
}
fs.writeFileSync('data/map.json', defaultMap)

app.use(express.static('dist'))
app.use(bodyParser.json())
app.post('/server.js', function (req, res, next) {
	var rawdata = fs.readFileSync('data/map.json')
	var mapJSON = JSON.parse(fs.readFileSync('data/map.json'))
	if (logins[req.body.username] == req.body.password) {
		var response
		if (req.body.requestType == "sync") {
			response = handleSync(req.body, mapJSON)
		} else if (req.body.requestType == "turnChange") {
			response = handleTurnChange(req.body, mapJSON)
		} else {
			console.log(`Invalid request made: ${req.body.requestType}`)
			response = makeError("Invalid request made")
		}
	} else  {
		console.log(`Incorrect password for user, ${req.body.username}, entered`)
		response = makeError("Wrong password")
	}
	res.send(JSON.stringify(response))
	next()
})
app.listen(port)
