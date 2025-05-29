import {Router, Request, json, RequestHandler, ErrorRequestHandler} from 'express';
import {join} from 'path';

import {Api, ForbiddenError, sdkTsTemplate, NotFoundError, BadReqError} from 'apizy';

function apizyExpress<Context extends {} = {}>(
    api: Api<Context>,
    options?: {
        devTools?: {
            enabled?: boolean;
            token?: string;
        };
        obfuscateErrors?: boolean;
        createContext?: (req: Request) => Context | Promise<Context>;
    },
): Router {
    const {devTools, obfuscateErrors, createContext} = options ?? {};
    const router = Router();

    if (devTools?.enabled) {
        const checkToken: RequestHandler = (req, res, next) => {
            if (devTools?.token && devTools.token !== (req.query.token ?? req.header('Authorization')?.split(' ')[1] ?? '')) {
                next(new ForbiddenError());
            } else {
                next();
            }
        }

        router.get('/dev/index', (req, res, next) => {
            const path = join(__dirname, '/../static/apieasy-dev-client.html');
            res.sendFile(path, {
                dotfiles: 'allow',
            });
        });

        router.get('/dev/sdk', checkToken, (req, res, next) => {
            void (async () => {
                let content: string;
                try {
                    content = await sdkTsTemplate(api.apiDescription);
                } catch (err: any) {
                    next(err);
                    return;
                }
                res.set('Content-Type', 'application/typescript');
                res.send(content);
            })();
        });

        router.get('/dev/doc', checkToken, (req, res, next) => {
            switch (req.query.type) {
                // case 'html':
                //     res.set('Content-Type', 'text/html');
                //     res.send(docHtmlTemplate(api));
                //     return;
                // case 'md':
                //     res.set('Content-Type', 'text/markdown');
                //     res.send(docMdTemplate(api));
                //     return;
                case 'json':
                    res.json(api.apiDescription);
                    return;
                default:
                    next(new BadReqError('Unknown type'));
            }
        });
    }

    router.post('/:method', json({type: 'application/json'}), (req, res, next) => {
        void (async () => {
            let output;
            let ctx: Context;
            try {
                ctx = (await createContext?.(req) ?? {}) as Context;
                output = await api.callMethod(req.params.method, req.body.input, req.body.extend, ctx);
            } catch (err: any) {
                next(err);
                return;
            }
            res.json({output});
        })();
    });

    router.use((req, res, next) => {
        next(new NotFoundError(`Path not found`));
    });

    router.use(((err, req, res, next) => {
        const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
        if (statusCode === 500) {
            console.error(err.stack);
            if (obfuscateErrors) {
                res.status(500).json({
                    error: 'Internal server error',
                    message: 'Internal server error',
                });
                return;
            }
        }
        res.status(statusCode).json({
            error: err.name,
            message: err.message,
        });
    }) as ErrorRequestHandler);

    return router;
}

export default apizyExpress;