'use strict';

const ERROR_CONSTRUCTORS
  = { 'Error': Error
    , 'EvalError': EvalError
    , 'InternalError': Error
    , 'RangeError': RangeError
    , 'ReferenceError': ReferenceError
    , 'SyntaxError': SyntaxError
    , 'TypeError': TypeError
    , 'URIError': URIError }

const classes = {}

function unmirror(remoteObj) {
  const { type, subtype, className, value, preview, description } = remoteObj
  const props = (preview && preview.properties) || []

  if (type === 'string') return value
  if (type === 'function') return function() {}
  if (type === 'undefined') return undefined
  if (type === 'boolean') return value === 'true' || value === true

  if (type === 'symbol') {
    if (typeof Symbol === 'undefined') return
    const match = (description || '').match(/Symbol\((.*)\)/)
    return Symbol((match && match[1]) || undefined)
  }

  if (type === 'number') {
    // If message came from Console domain
    if (typeof value === 'number') return value

    switch(value) {
      case 'NaN'      : return NaN
      case '-Infinity': return -Infinity
      case 'Infinity' : return Infinity
      case '-0'       : return -0
      default         : return maybeJSON(value)
    }
  }

  if (subtype === 'null') return null
  if (subtype === 'date') return new Date(description)
  if (subtype === 'node') return className

  if (subtype === 'regexp') {
    let source, lastIndex, flags = '';

    // If message came from Runtime or Debugger domain
    props.forEach(prop => {
      if (prop.name === 'source') source = prop.value
      if (prop.name === 'global' && unmirror(prop)) flags+= 'g'
      if (prop.name === 'ignoreCase' && unmirror(prop)) flags+= 'i'
      if (prop.name === 'multiline' && unmirror(prop)) flags+= 'm'
      if (prop.name === 'lastIndex') lastIndex = unmirror(prop)
    })

    // If message came from Console domain
    if (source === undefined) {
      let i = description.lastIndexOf(description[0])
      source = description.slice(1, i)
      flags = description.slice(i + 1)
    }

    const re = new RegExp(source, flags)
    re.lastIndex = lastIndex

    return re
  }

  if (subtype === 'error') {
    const Constructor = ERROR_CONSTRUCTORS[className] || Error

    let lines = (description || '').split('\n')
      , msg = lines[0]

    if (className && msg.slice(0, className.length) === className) {
      msg = msg.slice(className.length + 1).trim()
    }

    const stack = lines.slice(1).join('\n')
        , err = new Constructor(msg)

    if (stack) Object.defineProperty(err, 'stack', {
      enumerable: false, value: stack
    })

    props.forEach(function (p) {
      Object.defineProperty(err, p.name, {
        enumerable: false,
        value: unmirror(p)
      })
    })

    return err
  }

  // Mirror objects for Maps and Sets do not include elements,
  // you'll need to fetch them through the Runtime domain.
  if (subtype === 'map') return typeof Map !== 'undefined' ? new Map : undefined
  if (subtype === 'set') return typeof Set !== 'undefined' ? new Set : undefined
  if (subtype === 'array') return props.map(unmirror)

  const o = typeof value === 'object' ? value : makeInstance(className)
  props.forEach(prop => o[prop.name] = unmirror(prop))
  return o
}

function maybeJSON(value, notSetValue) {
  if (value === undefined) return notSetValue

  try {
    return JSON.parse(value)
  } catch(_) {
    return value
  }
}

function makeInstance(className) {
  if (!className || className === 'Object') return {}

  if (!classes[className]) {
    const namedFunction = new Function(`return function ${className}() {}`)
    classes[className] = namedFunction()
  }

  return new (classes[className])()
}

module.exports = unmirror
