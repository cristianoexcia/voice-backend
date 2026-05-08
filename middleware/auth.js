import jwt from 'jsonwebtoken'

export function auth(req, res, next) {

  try {

    const authHeader = req.headers.authorization

    if (!authHeader) {

      return res.status(401).json({
        error: 'Token não informado'
      })
    }

    const token = authHeader.split(' ')[1]

    jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {

        if (err) {

          return res.status(401).json({
            error: 'Token inválido'
          })
        }

        req.userId = decoded.id

        next()
      }
    )

  } catch (err) {

    return res.status(401).json({
      error: 'Erro autenticação'
    })
  }
}