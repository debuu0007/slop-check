try {
  risky();
} catch (error) {
  logger.error(error);
  throw error;
}
