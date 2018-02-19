import uuid from '../uuid/uuid';
import Vue, { PluginObject } from 'vue';
import { ModulVue } from '../vue/vue';
import { RequestConfig } from '../http/rest';
import { HttpService } from '../http/http';
import axios, {
    AxiosResponse,
    AxiosRequestConfig,
    CancelTokenSource,
    CancelToken
} from 'axios';
import { MUploadFileslist } from '../../components/upload-fileslist/upload-fileslist';
import { MFileSelect } from '../../components/file-select/file-select';

export interface MFile {
    uid: string;
    name: string;
    extension: string;
    file: File;
    status: MFileStatus;
    progress: number;
    rejection?: MFileRejectionCause;
}

export enum MFileRejectionCause {
    FILE_SIZE = 'file-size',
    FILE_TYPE = 'file-type',
    MAX_FILES = 'max-files'
}

export enum MFileStatus {
    READY = 'ready',
    UPLOADING = 'uploading',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REJECTED = 'rejected',
    CANCELED = 'canceled'
}

export interface MFileUploadOptions {
    url: string;
    config?: RequestConfig;
    onUploadProgress?: (progressEvent: ProgressEvent) => void;
}

const DEFAULT_STORE_NAME = 'DEFAULT';

export interface MFileValidationOptions {
    maxFiles?: number;
    maxSizeKb?: number;
    extensions?: string[];
}

export class FileService {
    private stores: { [name: string]: FileStore } = {};

    public files(storeName?: string): MFile[] {
        return this.getStore(storeName).files;
    }

    public setValidationOptions(
        options: MFileValidationOptions,
        storeName?: string
    ) {
        this.getStore(storeName).validationOptions = options;
    }

    public add(files: FileList, storeName?: string) {
        this.getStore(storeName).add(files);
    }

    public remove(fileuid: string, storeName?: string) {
        this.getStore(storeName).remove(fileuid);
    }

    public clear(storeName?: string) {
        this.getStore(storeName).clear();
        delete this.stores[this.getStoreName(storeName)];
    }

    public upload<T>(
        fileuid: string,
        options: MFileUploadOptions,
        storeName?: string
    ): Promise<AxiosResponse<T>> {
        return this.getStore(storeName).upload<T>(fileuid, options);
    }

    public cancelUpload(fileuid: string, storeName?: string) {
        this.getStore(storeName).cancelUpload(fileuid);
    }

    private getStoreName(name?: string): string {
        return name ? name : DEFAULT_STORE_NAME;
    }

    private getStore(name?: string): FileStore {
        const storeName = this.getStoreName(name);
        let store = this.stores[storeName];
        if (!store) {
            store = this.stores[storeName] = new FileStore();
        }

        return store;
    }
}

interface FileStoreRx extends Vue {
    files: MFile[];
}

class FileStore {
    private filesmap: { [uid: string]: MFile } = {};
    private cancelTokens: { [uid: string]: CancelTokenSource } = {};
    private options?: MFileValidationOptions;

    private rx: FileStoreRx;

    constructor() {
        this.rx = new Vue({
            data: {
                files: []
            }
        });
    }

    public set validationOptions(options: MFileValidationOptions) {
        this.options = options;
    }

    public get files(): MFile[] {
        return this.rx.files;
    }

    public getFile(uid: string): MFile {
        return this.filesmap[uid];
    }

    public add(files: FileList) {
        for (let i = 0; i < files.length; ++i) {
            const file = files[i];

            const mfile: MFile = {
                uid: uuid.generate(),
                name: file.name,
                extension: '',
                file: file,
                status: MFileStatus.READY,
                progress: 0
            };

            const match = file.name.match(/\.([a-zA-Z0-9]{3,4})$/);
            if (match) {
                mfile.extension = match[1];
            }

            this.validate(mfile);

            Object.freeze(mfile.file); // disable vuejs reactivity
            this.filesmap[mfile.uid] = mfile;
        }

        this.refreshRx();
    }

    public remove(uid: string) {
        delete this.filesmap[uid];
        this.refreshRx();
    }

    public clear() {
        this.rx.$destroy();
    }

    public upload<T>(
        fileuid: string,
        options: MFileUploadOptions
    ): Promise<AxiosResponse<T>> {
        const file = this.getFile(fileuid);

        const onUploadProgress = (e: ProgressEvent) => {
            file.progress = e.loaded / e.total * 100;
            if (options.onUploadProgress) {
                options.onUploadProgress(e);
            }
        };

        const httpService = (Vue.prototype as ModulVue).$http;
        const cfg: RequestConfig = {
            method: 'POST',
            rawUrl: options.url,
            data: file.file,
            headers: {
                'Content-Type': file.file.type
            },
            ...options.config
        };

        const cancelToken = axios.CancelToken.source();
        this.cancelTokens[fileuid] = cancelToken;

        const axiosOptions: AxiosRequestConfig = {
            onUploadProgress: onUploadProgress,
            cancelToken: cancelToken.token
        };

        file.status = MFileStatus.UPLOADING;
        const promise = httpService.execute<T>(cfg, axiosOptions);

        return promise
            .then<AxiosResponse<T>>(
                value => {
                    file.status = MFileStatus.COMPLETED;
                    file.progress = 100;
                    return value;
                },
                ex => {
                    file.status = axios.isCancel(ex)
                        ? MFileStatus.CANCELED
                        : MFileStatus.FAILED;
                }
            )
            .then<AxiosResponse<T>>(value => {
                delete this.cancelTokens[fileuid];
                return value;
            });
    }

    public cancelUpload(fileuid: string) {
        this.cancelTokens[fileuid].cancel();
        delete this.cancelTokens[fileuid];
    }

    private validate(file: MFile) {
        if (!this.options) return;

        if (this.options.extensions) {
            this.validateExtension(file);
        }

        if (this.options.maxSizeKb) {
            this.validateSize(file);
        }

        if (this.options.maxFiles) {
            this.validateMaxFiles(file);
        }
    }

    private validateExtension(file: MFile) {
        let valid = true;

        const match = file.name.match(/\.([a-zA-Z0-9]{3,4})$/);
        if (match) {
            if (this.options!.extensions!.indexOf(match[1]) === -1) {
                valid = false;
            }
        } else {
            valid = false;
        }

        if (!valid) {
            file.status = MFileStatus.REJECTED;
            file.rejection = MFileRejectionCause.FILE_TYPE;
        }
    }

    private validateSize(file: MFile) {
        if (file.file.size / 1024 > this.options!.maxSizeKb!) {
            file.status = MFileStatus.REJECTED;
            file.rejection = MFileRejectionCause.FILE_SIZE;
        }
    }

    private validateMaxFiles(file: MFile) {
        const nbValidFiles = Object.keys(this.filesmap).reduce((t, uid) => {
            let f = this.filesmap[uid];
            return (t =
                f.status === MFileStatus.COMPLETED ||
                f.status === MFileStatus.READY ||
                f.status === MFileStatus.UPLOADING
                    ? t + 1
                    : t);
        }, 0);

        if (nbValidFiles >= this.options!.maxFiles!) {
            file.status = MFileStatus.REJECTED;
            file.rejection = MFileRejectionCause.MAX_FILES;
        }
    }

    private refreshRx() {
        const files: MFile[] = [];
        for (const f in this.filesmap) {
            files.push(this.filesmap[f]);
        }
        this.rx.files = files;
    }
}

const FilePlugin: PluginObject<any> = {
    install(v, options) {
        console.debug('$file', 'plugin.install');
        let file: FileService = new FileService();
        (v as any).$file = file;
        (v.prototype as any).$file = file;
    }
};

export default FilePlugin;
