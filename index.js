require("dotenv/config")
const express = require("express")
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


function GetRawBody(req, res, next) {
  req.pipe(
    concat( data => {
      if (data.length === 0) {
        return res.sendStatus(400)
      }
      let rawBody = data.toString();
      console.log(rawBody)
      req.rawBody = rawBody
      next()
    })
  )
}


function GetFormBody(req, res, next) {
  let formBody = qs.parse(req.rawBody)
  req.formBody = formBody
  next()
}


function CheckSlackSignature(req, res, next) {
  try {
    let {success, message } = signVerification(req.headers, req.rawBody)
    if (success === true) {
      return next()
    } else {
      console.log(message)
      return res.sendStatus(401)
    }
  } catch (err) {
    console.log(err)
    return res.sendStatus(401)
  }
}


const commandHandlers = {
  "subscribe": subscribeHandler,
  "fetch": fetchHandler,
  "list": listHandler,
  "unsubscribe": unsubscribeHandler,
}


async function subscribeHandler(req, res) {
  let userId = req.formBody.user_id
  let args = req.formBody.text.split(" ")
  let [cmd, alias, feedUrl] = args
  if (args.length < 3) {
    let msg = formatCommandUsage(cmd)
    return res.send(msg)
  }
  await rss.subscribe(userId, alias, feedUrl)
  res.send("Success")
}



async function fetchHandler(req, res, next) {
  let userId = req.formBody.user_id
  let args = req.formBody.text.split(" ")
  let [cmd, alias, feedSize] = args
  if (args.length < 2) {
    let msg = formatCommandUsage(cmd)
    return res.send(msg)
  }
  let url = await rss.getRssUrl(userId, alias)
  if (url === null) {
    return res.send("No such feed, run `/rss list` to see your feeds.")
  }
  let feed = []
  try {
    feed = await rss.getRssFeed(url)
  } catch(err) {
    console.log(err)
    return res.send(`Error getting feed from ${defaultFeedUrl}`)
  }
  feedSize = isNaN(feedSize) ? 10 : Math.max(1, Math.min(feedSize, 25))
  res.send(formatSlackFeed(feed, feedSize))
}


async function listHandler(req, res, next) {
  let userId = req.formBody.user_id
  let subs = await rss.listSubscriptions(userId)
  let formatted = formatSubsList(subs)
  res.send(formatted)
}


async function unsubscribeHandler(req, res, next) {
  let userId = req.formBody.user_id
  let args = req.formBody.text.split(" ")
  let [cmd, alias] = args
  if (args.length < 2) {
    let msg = formatCommandUsage(cmd)
    return res.send(msg)
  }
  await rss.unSubscribe(userId, alias)
  res.send("Success")
}


async function CommandHandler(req, res, next) {
  let command = req.formBody.text.split(" ")[0].toLowerCase()
  if (!commandHandlers.hasOwnProperty(command)) {
    return next()
  }
  let handler = commandHandlers[command]
  try {
    await handler(req, res, next)
  } catch(err) {
    console.log(err)
    res.send("Unexpected Error, please try again later.")
  }
}


async function DefaultFeedHandler(req, res, next) {
  if (!defaultFeedUrl) {
    return next()
  }
  let feedSize = parseInt(req.formBody.text)
  if (req.formBody.text !== "" && isNaN(feedSize)) {
    return next()
  }
  feedSize = isNaN(feedSize) ? 10 : Math.max(1, Math.min(feedSize, 25))
  let feed = []
  try {
    feed = await rss.getRssFeed(defaultFeedUrl)
  } catch(err) {
    console.log(err)
    return res.send(`Error getting feed from ${defaultFeedUrl}`)
  }
  res.send(formatSlackFeed(feed, feedSize))
}


async function HelpHandler(req, res, next) {
  let formatted = formatCommandsUsage()
  res.send(formatted)
}


const app = express()
const port = process.env.PORT || 5000
app.post('/', [
  GetRawBody,
  CheckSlackSignature,
  GetFormBody,
  CommandHandler,
  DefaultFeedHandler,
  HelpHandler
])


rss.init().then(() => {
  console.log("Connected to db")
  app.listen(port, () => {
    console.log("Started Server...")
    console.log(`Listening on http://127.0.0.1:${port}`)
  }) 
}).catch( (e) => console.log(e))