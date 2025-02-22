const JSON5 = require('json5')


module.exports = (collection, config) => {

  const output = {}

  // swagger version
  output.swagger = "2.0"

  // info object
  output.info = {}
  output.info.title = (config.info && config.info.name)
    ? config.info.name : (collection.info.name || "")
  output.info.description = (config.info && config.info.description)
    ? config.info.description : (collection.info.description || "No description")
  output.info.version = (config.info && config.info.version)
    ? config.info.version : process.env.npm_package_version

  // host
  // output.host = (config.host) ? config.host : mostPopularHost(collection)
  if (config.host) output.host = config.host

  // basepath
  if (config.basepath) output.basepath = config.basepath

  // schemes
  output.schemes = (config.schemes) ? config.schemes : ['https']

  // consumes
  if (config.consumes) {
    output.consumes = config.consumes
  }

  // produces
  if (config.produces) {
    output.produces = config.produces
  }

  // paths
  output.paths = getPaths(collection, config)

  return output
}

const getPaths = (collection, config) => {
  let result = {}

  let allItems = collection.item
    .map(grouping => grouping.item?grouping.item.map(groupingItem => Object.defineProperties(groupingItem,{tags: {value: grouping.name,writable : true}})):grouping)
    .flat(1)
    .forEach(item =>  {
      let path = `/${item.request.url.path.join('/')}`
        .replace(/{{/g,'{')
        .replace(/}}/g,'}')
      result[path] = result[path] || {}

      // each method (GET, POST, PUT, DELETE) for path
      result[path][item.request.method.toLowerCase()] = {
        tags: [item.tags||'default'],
        summary: item.name,

        // parameter types: [query, path, header, body, form]
        parameters: getParameters(
          item.request.header,
          item.request.body,
          item.request.url,
          config
        ),

        responses: getResponses(item.response, config)
      }
    })

  return result
}


const getParameters = (header, body, url, config) => {
  result = []
  result.push(processReqHeader(header, config))
  result.push(processReqBody(body, config))
  result.push(processReqPath(url, config))
  result.push(processReqQuery(url, config))

  return result.flat(1)
}


const processReqHeader = (header, config) => {
  let result
  result = header.map(object => {
    // early exit if omitted
    if(config.omit.headers.indexOf(object.key) !== -1) {
      return null
    }

    let result = {}
    result.in = "header"
    result.name = object.key
    if (config.require_all.indexOf("headers") !== -1) result.required = true
    result.type = "string"
    return result
  }).filter( x => x)

  return result
}


const processReqBody = (body, config) => {
  let result = {}
  let parsedBody, parsedBodyKeys
  if(!body || !body.raw) {
    return []
  }

  try {
    parsedBody = JSON5.parse(body.raw)
    parsedBodyKeys = Object.keys(parsedBody)
  }
  catch(err) {
      console.error(err)
      console.log(body.raw)

    throw new Error(`Request body must be array or object, instead got: ${body}`)
  }

  result.in = "body"
  result.name = (parsedBodyKeys.length === 1) ? parsedBodyKeys[0] : "body"
  result.schema = bodyItemToSwagger(parsedBody, config)
  if (config.require_all.indexOf("body") !== -1) result.required = true
  return result
}


const processReqQuery = (url, config) => {
  let result
  if (!url.query || !url.query.length) return []

  result = url.query.map (query => {
    let result = {}
    result.in = 'query'
    result.name = query.key
    result.type = typeof query.value
    if (config.require_all.indexOf("query") !== -1) result.required = true
    return result
  })

  return result
}


const processReqPath = (url, config) => {
  let result
  if (url.path.length === 1) return []

  // clone && remove first element because its never a slug
  let paths = url.path.slice(1)

  result = paths.map (path => {
    if (path.indexOf('{{') === -1) return null
    let result = {}
    result.in = 'path'
    result.name = path.match(/{{(.*)}}/)[1]
    result.type = typeof result.name
    if (config.require_all.indexOf("path") !== -1) result.required = true

    return result
  }).filter( x => x)

  return result
}


const bodyItemToSwagger = (value, config) => {
  let result
  let type = (Array.isArray(value)) ? "array" : typeof value

  switch(type){
    case("array"):
      result = {
        type: "array",
        items: {
          type: (typeof value[0] === 'number') ? "number" : "string"
        }
      }
      break

    case("object"):
      result = {
        type: "object",
        properties: {}
      }
      if(value) {
        Object.entries(value)
            .forEach(arr => {result.properties[arr[0]] = bodyItemToSwagger(arr[1], config)})
      }
      break

    case "number":
    case "string":
    case "boolean":
      result = {
        type: type
      }
      break

    default:
      throw new Error(`Type ${type} not supported`)
  }

  return result
}


const getResponses = (responses, config) => {
  if (!responses.length) return config.responses

  let result = {}
  responses.forEach (response => {
    result[response.code] = { description: response.status }
  })
  return result
}
