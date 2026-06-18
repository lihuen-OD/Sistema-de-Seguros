export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AppError'
    // Necesario para que instanceof funcione correctamente con clases que extienden Error
    Object.setPrototypeOf(this, AppError.prototype)
  }
}
