const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const app = express()
const port = 8000

var logins = {
    "admin": "hopefully this doesnt need to be secure",
    "test": "user test password"
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
	var changes = req.body.changes
	var mapJSON = JSON.parse(fs.readFileSync('data/map.json'))
	if (logins[req.body.username] == req.body.password) {
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
		res.send(mapRaw)

		fs.writeFileSync('data/map.json', mapRaw)
	} else  {
		console.log(`Incorrect password for user, ${req.body.username}, entered`)
		res.send(JSON.stringify({error: "Wrong password"}))
	}
	next()
})
app.listen(port)
