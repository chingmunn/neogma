import * as clone from 'clone';
import { NeogmaConstraintError } from '../errors/NeogmaConstraintError';
import { StringSequence } from '../utils/StringSequence';

/**
 * the bind param which should be passed to a query. It throws an error if more than one of each key is added
 */
export class BindParam {
    /** acquires a BindParam, so it ensures that a BindParam is always returned. If it's passed, it will be returned as is. Else, a new one will be created and returned */
    public static acquire(bindParam: BindParam | null) {
        if (bindParam) { return bindParam; }
        return new BindParam();
    }

    /** the object with the bind param */
    private bind: Record<string, any>;

    constructor(...objects: Array<BindParam['bind']>) {
        this.bind = {};
        this.add(...objects);
    }

    /**
     * adds objects to the bind attribute, throwing an error if a given key already exists in the bind param
     */
    public add(...objects: Array<BindParam['bind']>) {
        for (const object of objects) {
            for (const key in object) {
                if (!object.hasOwnProperty(key)) { continue; }
                if (this.bind.hasOwnProperty(key)) {
                    throw new NeogmaConstraintError(`key ${key} already in the bind param`);
                }
                this.bind[key] = object[key];
            }
        }

        return this;
    }

    /**
     * returns a new BindParam instance with a clone of the bind property
     */
    public clone() {
        return new BindParam(clone(this.get()));
    }

    /**
     * returns the bind attribute
     */
    public get() {
        return this.bind;
    }

    /** returns a name which isn't a key of bind, and starts with the suffix */
    public getUniqueName(suffix: string): string {
        if (!this.bind.hasOwnProperty(suffix)) {
            return suffix;
        } else {
            const stringSequence = new StringSequence('a', 'zzzz', 4);
            while (true) {
                const newKey = suffix + '__' + stringSequence.getNextString(true);
                if (!this.bind.hasOwnProperty(newKey)) {
                    return newKey;
                }
            }
        }
    }

    /** returns a name which isn't a key of bind and adds the value to the bind param with the created name */
    public getUniqueNameAndAdd(
        suffix: Parameters<typeof BindParam['prototype']['getUniqueName']>[0],
        value: Parameters<typeof BindParam['prototype']['add']>[0][0]
    ): string {
        const name = this.getUniqueName(suffix);
        this.add({
            [name]: value,
        });
        return name;
    }
}

/** passing an array directly as an value also works, i.e. { primes: [2, 3, 5, 7] } */
interface WhereInI {
    in: Array<string | number>;
}

const isWhereIn = (value: WhereAttributesI): value is WhereInI => {
    return (value as any).in;
};

type WhereAttributesI = string | number | boolean | Array<string | number> | WhereInI;

export interface WhereParamsI {
    /** the identifiers to use */
    [identifier: string]: {
        /** the keys of those identifiers */
        [key: string]: WhereAttributesI;
    };
}

/** a Where instance or the basic object which can create a Where instance */
export type AnyWhere = WhereParamsI | Where;

export class Where {
    /** where statement to be placed in a query */
    public statement: string;
    /** where bind params. Ensures that keys of the bind param are unique */
    public bindParam: BindParam;
    /** all the given options, so we can easily combine them into a new statement */
    private rawParams: WhereParamsI[] = [];

    constructor(
        /** the where parameters to use */
        whereParams: Parameters<Where['addParams']>[0],
        /** an existing bind param or where object so the properties can be merged. If empty, a new one will be created and returned */
        bindOrWhere?: Parameters<Where['addParams']>[1],
    ) {
        this.addParams(whereParams, bindOrWhere);
        Object.setPrototypeOf(this, Where.prototype);
    }

    /** refreshes the statement and the bindParams by the given where params */
    public addParams(
        /** the where parameters to use */
        whereParams: WhereParamsI,
        /** an existing bind param or where object so the properties can be merged. If empty, a new one will be created and returned */
        bindOrWhere?: BindParam | Where,
    ) {
        this.bindParam = new BindParam();
        if (bindOrWhere instanceof BindParam) {
            this.bindParam = BindParam.acquire(bindOrWhere);
        } else if (bindOrWhere instanceof Where) {
            // push the existing rawParams in order, at the beginning of the array
            this.rawParams.push(...bindOrWhere.rawParams);
        }
        // the the latest whereParams to the end of the array
        this.rawParams.push(whereParams);

        // set the statement and bindParams fields
        this.setFieldsByRawParams();
    }

    /** sets the statement, bindParams fields by the rawParams */
    private setFieldsByRawParams() {
        this.statement = '';

        // merge all rawParams into a single one. That way, the latest rawOption will dictate its properties if some previous ones have a common key
        const params = Object.assign({}, ...this.rawParams);

        for (const nodeAlias in params) {
            if (!params.hasOwnProperty(nodeAlias)) { continue; }
            for (const key in params[nodeAlias]) {
                if (!params[nodeAlias].hasOwnProperty(key)) { continue; }

                const value = params[nodeAlias][key];

                if (['string', 'number', 'boolean', 'array'].includes(typeof value)) {
                    // in case of an array, use the IN operand
                    const operand = value instanceof Array ? 'IN' : '=';
                    this.addAnd(`${nodeAlias}.${key} ${operand} ${this.getNameAndAddToParams(key, value)}`);
                } else if (isWhereIn(value)) {
                    this.addAnd(`${nodeAlias}.${key} IN ${this.getNameAndAddToParams(key, value.in)}`);
                }
            }
        }
    }

    /** generates a variable name, adds the value to the params under this name and returns it */
    private getNameAndAddToParams = (prefix, value: string | number | boolean | object) => {
        const name = this.bindParam.getUniqueNameAndAdd(prefix, value);
        return `{${name}}`;
    }

    /** adds a value to the statement by prepending AND if the statement already has a value */
    private addAnd = (value: string) => {
        if (!this.statement) {
            this.statement += value;
        } else {
            this.statement += ` AND ${value}`;
        }
    }

    /** returns a Where object if data is specified, else returns null */
    public static get(params: AnyWhere, bindParam?: BindParam): Where | null {
        if (!params) { return null; }

        if (params instanceof Where) {
            return params;
        }

        return new Where(params, bindParam);
    }

}
