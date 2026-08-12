export class BscError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'BscError';
        this.code = code;
    }
}
//# sourceMappingURL=bsc-error.js.map