const http = require("http")
const qs = require("querystring")
const concat = require("concat-stream")

const rss = require("./rss.js")
const signVerification = require("./signVerification.js")

const defaultFeedUrl = process.env.DEFAULT_FEED_URL
const commandMessages = {
  subscribe: "Subscribe to a new feed:  `/rss subscribe <alias> <url>`",
  fetch: "Fetch news from an existing feed: `/rss fetch <alias> [numFeeds]`",
  list: "List existing subscriptions: `/rss list`",
  unsubscribe: "Remove an existing subscription: `/rss unsubscribe <alias>`",
}


function formatSlackFeed(feed, feedSize) {
  let titleBlock = {type: "section", text: {type: "mrkdwn", text: feed.title}}
  let feedText = feed.items.slice(0, feedSize).map((entry) => `- <${entry.link}|${entry.title}>`).join("\n")
  let feedBlock = {type: "section", text: {type: "mrkdwn", text: feedText}}
  return { blocks: [titleBlock, feedBlock] }
}


function formatSubsList(subs) {
  let titleMsg = subs.length === 0 ? "No avaiable subscriptions." : "Available Subscriptions:"
  let titleBlock = {type: "section", text: {type: "mrkdwn", text: titleMsg}}
  if (subs.length === 0) {
    return { blocks: [titleBlock] }
  }
  let subText = subs.map((entry) => `- <${entry.rss_url}|${entry.alias}>`).join("\n")
  let subBlock = {type: "section", text: {type: "mrkdwn", text: subText}}
  return { blocks: [titleBlock, subBlock] }
}


function formatCommandsUsage() {
  let titleMsg = "Valid Commands: `subscribe`, `fetch`, `list`, `unsubscribe`, `help`"
  let titleBlock = {type: "section", text: {type: "mrkdwn", text: titleMsg}}
  let helpText = Object.values(commandMessages).join("\n")
  let helpBlock = {type: "section", text: {type: "mrkdwn", text: helpText}}
  return { blocks: [titleBlock, helpBlock] }
}


function formatCommandUsage(command) {
  let titleMsg = `Invalid Usage for \`${command}\`.`
  let titleBlock = {type: "section", text: {type: "mrkdwn", text: titleMsg}}
  let helpText = commandMessages[command]
  let helpBlock = {type: "section", text: {type: "mrkdwn", text: helpText}}
  return { blocks: [titleBlock, helpBlock] }
}


function makeResponse(statusCode, headers, body) {
  headers = headers || {}
  if (headers["Content-Type"] === "application/json") {
    body = JSON.stringify(body)
  }
  body = body || ""
  return {
    statusCode,
    headers,
    body
  }
}


async function defaultResponse(body) {
  let feedSize = parseInt(body.text)
  isNaN(feedSize) ? feedSize = 10 : feedSize = Math.max(1, Math.min(feedSize, 25))
  if (!defaultFeedUrl) {
    return helpResponse(body)
  }
  let feed = await rss.getRssFeed(defaultFeedUrl)
  let formatted = formatSlackFeed(feed, feedSize)
  return makeResponse(200,
    {"Content-Type": "application/json"},
    formatted)
}


async function subscribeResponse(body) {
  let userId = body.user_id
  let args = body.text.split(" ")
  let [cmd, alias, feedUrl] = args
  if (args.length < 3) {
    let msg = formatCommandUsage(cmd)
    return makeResponse(200, {"Content-Type": "application/json"}, msg)
  }
  let res = await rss.subscribe(userId, alias, feedUrl)
  return makeResponse(200, {"Content-Type": "text/plain"}, "Success")
}


async function fetchResponse(body) {
  let userId = body.user_id
  let args = body.text.split(" ")
  let [cmd, alias, feedSize] = args
  if (args.length < 2) {
    let msg = formatCommandUsage(cmd)
    return makeResponse(200, {"Content-Type": "application/json"}, msg)
  }
  let url = await rss.getRssUrl(userId, alias)
  if (url === null) {
    return listResponse(body)
  }
  let feed = []
  try {
    feed = await rss.getRssFeed(url)
  } catch(err) {
    let msg = `Error getting feed from ${url}`
    return makeResponse(200, {"Content-Type": "text/plain"}, msg)
  }
  feedSize = parseInt(feedSize)
  isNaN(feedSize) ? feedSize = 10 : feedSize = Math.max(1, Math.min(feedSize, 25))
  let formatted = formatSlackFeed(feed, feedSize)
  return makeResponse(200, {"Content-Type": "application/json"}, formatted)
}


async function listResponse(body) {
  let userId = body.user_id
  let subs = await rss.listSubscriptions(userId)
  let formatted = formatSubsList(subs)
  return makeResponse(200, {"Content-Type": "application/json"}, formatted)
}


async function unsubscribeResponse(body) {
  let userId = body.user_id
  let args = body.text.split(" ")
  let [cmd, alias] = args
  if (args.length < 2) {
    let msg = formatCommandUsage(cmd)
    return makeResponse(200, {"Content-Type": "application/json"}, msg)
  }
  await rss.unSubscribe(userId, alias)
  return makeResponse(200, {"Content-Type": "text/plain"}, "Success")
}


async function helpResponse(body) {
  let msg = formatCommandsUsage("Unrecognized Command. Example usages:")
  return makeResponse(200, {"Content-Type": "application/json"}, msg)
}


const commandHandlers = {
  "": defaultResponse,
  "subscribe": subscribeResponse,
  "fetch": fetchResponse,
  "list": listResponse,
  "unsubscribe": unsubscribeResponse,
  "help": helpResponse
}


function getCommandHandler(command) {
  if (!isNaN(parseInt(command))) {
    return defaultResponse
  }
  return commandHandlers.hasOwnProperty(command) ? commandHandlers[command] : help;
} 

async function getAppResponse(formBody) {
  let text = formBody.text
  if (text === undefined) {
    return makeResponse(400)
  }
  let args = text.split(" ")
  let command = args[0].toLowerCase()
  let commandHandler = getCommandHandler(command)
  try {
    let res = await commandHandler(formBody)
    return res
  } catch(e) {
    console.log(e)
    return makeResponse(200, {"Content-Type": "application/json"}, "Unexpected Error, Please try again later.")
  }
}


const app = http.createServer((request, response) => {
  request.pipe(
    concat( data => {
      if (data.length === 0) {
        response.writeHead(400)
        response.end()
        return
      }
      let body = data.toString();
      console.log(body)
      let vResult = signVerification(request.headers, body)
      if (!vResult.success) {
        console.log(vResult)
        response.writeHead(401)
        response.end()
        return
      }
      let formbody = qs.parse(body)
      getAppResponse(formbody).then( appResp => {
        response.writeHead(appResp.statusCode, appResp.headers)
        response.write(appResp.body)
        response.end()
      })
    })
  )
})


rss.init().then(() => {
  console.log("Connected to db")
  console.log("Started Server...")
  const port = process.env.PORT || 5000
  app.listen(port)
  console.log(`Listening on http://127.0.0.1:${port}`)
}).catch( (e) => console.log(e))


