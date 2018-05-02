'use strict'

const shimmer = require('shimmer')

function createWrapOperation (tracer, config, operationName) {
  return function wrapOperation (operation) {
    return function operationWithTrace (ns, ops, options, callback) {
      let result

      tracer.trace('mongodb.query', span => {
        span.addTags({
          'service.name': config.service || 'mongodb',
          'resource.name': `${operationName} ${ns} ${JSON.stringify(ops)}`,
          'span.type': 'db',
          'db.name': ns,
          'out.host': this.s.options.host,
          'out.port': this.s.options.port
        })

        if (typeof options === 'function') {
          result = operation.call(this, ns, ops, wrapCallback(tracer, span, options))
        } else {
          result = operation.call(this, ns, ops, options, wrapCallback(tracer, span, callback))
        }
      })

      return result
    }
  }
}

function createNextWrap (tracer, config) {
  return function nextWrap (next) {
    return function next_trace (cb) {
      let result

      console.log(this)

      tracer.trace('mongodb.query', span => {
        span.addTags({
          'service.name': config.service || 'mongodb'
          // 'resource.name': `find ${this.cmd} ${JSON.stringify(ops)}`,
          // 'span.type': 'db',
          // 'db.name': ns,
          // 'out.host': this.s.options.host,
          // 'out.port': this.s.options.port
        })

        result = next.call(this, wrapCallback(tracer, span, cb))
      })

      return result
    }
  }
}

function wrapCallback (tracer, span, done) {
  return tracer.bind((err, res) => {
    if (err) {
      span.addTags({
        'error.type': err.name,
        'error.msg': err.message,
        'error.stack': err.stack
      })
    }

    span.finish()

    if (done) {
      done(err, res)
    }
  })
}

// function createOnceWrap (api) {
//   return function onceWrap (once) {
//     return function once_trace (event, cb) {
//       return once.call(this, event, api.wrap(cb))
//     }
//   }
// }

module.exports = [
  // {
  //   file: 'lib/connection/pool.js',
  //   versions: ['1.x', '2.x'],
  //   patch (pool, api) {
  //     shimmer.wrap(pool.prototype, 'once', createOnceWrap(api))
  //   },
  //   unpatch (pool) {
  //     shimmer.unwrap(pool.prototype, 'once')
  //   }
  // },
  {
    name: 'mongodb-core',
    versions: ['1.x', '2.x', '3.x'],
    patch (mongo, tracer, config) {
      shimmer.wrap(mongo.Server.prototype, 'command', createWrapOperation(tracer, config, 'command'))
      shimmer.wrap(mongo.Server.prototype, 'insert', createWrapOperation(tracer, config, 'insert'))
      shimmer.wrap(mongo.Server.prototype, 'update', createWrapOperation(tracer, config, 'update'))
      shimmer.wrap(mongo.Server.prototype, 'remove', createWrapOperation(tracer, config, 'remove'))
      shimmer.wrap(mongo.Cursor.prototype, 'next', createNextWrap(tracer, config))
    },
    unpatch (mongo) {
      shimmer.unwrap(mongo.Server.prototype, 'command')
      shimmer.unwrap(mongo.Server.prototype, 'insert')
      shimmer.unwrap(mongo.Server.prototype, 'update')
      shimmer.unwrap(mongo.Server.prototype, 'remove')
      shimmer.unwrap(mongo.Cursor.prototype, 'next')
    }
  }
]
