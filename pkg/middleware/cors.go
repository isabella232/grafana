package middleware

import (
	"github.com/Unknwon/macaron"
)

func Cors() macron.Handler {
	return func(ctx *Context) {
		ctx.Next()
		ctx.Resp.Header.Set("Access-Control-Allow-Origin", "*.lyft.net")
	}
}
