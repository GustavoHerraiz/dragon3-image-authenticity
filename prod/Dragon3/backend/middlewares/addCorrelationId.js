export default function addCorrelationId(req, res, next) {
    req.correlationId = req.get('X-Correlation-ID') ||
                       `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.set('X-Correlation-ID', req.correlationId);
    next();
}
