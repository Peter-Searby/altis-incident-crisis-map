const express = require('express')
const app = express()
const port = 8000


app.post('/server.js', function (req, res, next) {
	res.send('Test successful: '+ req)
	next()
})
// app.use(function (req, res, next) {
// 	console.log("------------------------------------------------------------")
// 	console.log(req)
// 	console.log("------------------")
// 	console.log(res)
// 	next()
// })
app.use(express.static('dist'))
app.listen(port)
