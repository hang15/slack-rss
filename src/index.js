require("dotenv/config")
let { getAppResponse } = require("./main")

exports.handler = async function(event, context) {
  console.log(event.headers);
  console.log(event.body);
  return await getAppResponse(event.headers, event.body)
}