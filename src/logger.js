module.exports.logRequest = (config) => (req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
};
