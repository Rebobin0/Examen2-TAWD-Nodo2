require('dotenv').config({ quiet: true });

const app = require('./src/app');

const puerto = process.env.PORT || 3000;

app.listen(puerto, () => {
  console.log(`Sucursal escuchando en http://localhost:${puerto}`);
});
