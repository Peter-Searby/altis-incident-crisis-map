const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 8000


app.use(express.static('dist'))
app.use(bodyParser.json())
app.post('/server.js', function (req, res, next) {
	res.send('Test successful: '+ req.body.text)
	next()
})
app.listen(port)
