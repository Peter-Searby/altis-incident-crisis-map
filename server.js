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
				default:
					console.log(`Unusual change requested: ${change.type}`)
			}
		}

		var mapRaw = JSON.stringify(mapJSON)
		response = {mapState: mapJSON}
		if (reqBody.username != "admin") {
			response.nextTurnChange = turnChangeTime[reqBody.username]
		}

		fs.writeFileSync('data/map.json', mapRaw)
	} else {
		userAttemptAdminError(change.type)
		response = makeError("Error: User attempted admin move")
	}
	return response
}

function getNextTurnUser() {
	var nextUser = turnChangeTime[0]
	for (var u in turnChangeTime) {
		if (turnChangeTime[u] < turnChangeTime[nextUser]) {
			nextUser = u
		}
	}
	return nextUser
}

function handleTurnChange(reqBody, mapJSON) {
	if (reqBody.username == getNextTurnUser()) {
		nextTurnChange[username] = d.getTime()+settings.turnTime*turnChangeTime.length
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
		response = {
			mapState: mapJSON,
			nextTurnChange: nextTurnChange[reqBody.username]
		}

		fs.writeFileSync('data/map.json', mapRaw)
	} else {
		response = makeError("out of turn - turn change")
	}
	return response
}


var d = new Date()

var logins = {
    "admin": "hopefully this doesnt need to be secure",
    "test1": "user test password",
    "test2": "user test2 password"
}

var settings = fs.readFileSync('default-map.json')

var turnChangeTime = {
	"test1": d.getTime()+settings.turnTime,
	"test2": d.getTime()+settings.turnTime*2
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
