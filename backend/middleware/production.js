const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { publicOrigin } = require('../config/environment');
function productionSecurity(app) {
  const origin=publicOrigin();
  app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],fontSrc:["'self'",'data:'],connectSrc:["'self'",origin.replace(/^http/,'ws')],workerSrc:["'self'",'blob:'],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:origin.startsWith('https:')?[]:null}}}));
  app.use((req,res,next)=>{
    res.set('X-AMS-Demo','fictional-ephemeral');
    if (req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
    const requestOrigin=req.get('origin');
    if (requestOrigin && requestOrigin!==origin) return res.status(403).json({message:'Origin is not allowed'});
    if (process.env.RENDER && !req.secure && req.path!=='/api/health') return res.redirect(308,origin+req.originalUrl);
    next();
  });
}
function productionFrontend(app) {
  const directory=path.resolve(__dirname,'../../frontend/build');
  if (!fs.existsSync(path.join(directory,'index.html'))) throw new Error('Frontend production build is missing. Run npm run build:production.');
  app.use((req,res,next)=>{
    if (req.path.split('/').some(part=>part.startsWith('.')) || /^\/(backend|data|scripts|node_modules|package(?:-lock)?\.json|render\.yaml)(\/|$)/i.test(req.path) || /\.(db|sqlite3?|csv|sql|env|pem|key|log|map)$/i.test(req.path)) return res.status(404).end();
    next();
  });
  app.use(require('express').static(directory,{dotfiles:'deny',index:false,maxAge:'1h',setHeaders:(res,file)=>{if(file.endsWith('.html'))res.set('Cache-Control','no-store');}}));
  app.get('/{*splat}',(req,res)=>{
    if (path.extname(req.path) || !req.accepts('html')) return res.status(404).end();
    res.set('Cache-Control','no-store').sendFile(path.join(directory,'index.html'));
  });
}
module.exports={productionSecurity,productionFrontend};
