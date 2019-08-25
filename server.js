const express = require('express')
const fs = require('fs')
const bodyParser = require('body-parser')
const app = express()
const port = 8000


app.use(express.static('dist'))
app.use(bodyParser.json())
app.post('/server.js', function (req, res, next) {
	fs.writeFile('dist/test.json', '{"test-point": ['+req.body.point+']}', function (err) {
		if (err) throw err
	})
	next()
})
app.listen(port)
