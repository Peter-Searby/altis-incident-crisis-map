const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const app = express()
const port = 8000

var defaultMap = fs.readFileSync('default-map.json')
fs.writeFileSync('data/map.json', defaultMap)

app.use(express.static('dist'))
app.use(bodyParser.json())
app.post('/server.js', function (req, res, next) {
	var rawdata = fs.readFileSync('data/map.json')
	var changes = req.body.changes
	var mapJSON = JSON.parse(fs.readFileSync('data/map.json'))
	for (var change of changes) {
		if (change.type == "add") {
			mapJSON.units.push(change.unit)
		}
	}
	var mapRaw = JSON.stringify(mapJSON)
	res.send(mapRaw)

	fs.writeFileSync('data/map.json', mapRaw)
	next()
})
app.listen(port)
