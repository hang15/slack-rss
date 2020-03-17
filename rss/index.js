module.exports = function(clientName) {
  if (!clientName) {
    throw Error(`Please specify Db Client`)
  }
  try {
    let clientModule = require(`./${clientName}-client.js`)
    console.log(`Running with ${clientName} Db Client`)
    return clientModule
  } catch (err) {
    console.log(err)
    throw Error(`Invalid Db Client`)
  }
}