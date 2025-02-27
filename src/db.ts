/**
 * @fileoverview PosgreSQL connection handler.
 * @since 1.0.0
 * @author Kruhlmann
 */

import { Pool } from "pg";
import { LoggingLevel } from "./typings/types";
import { Sequelize, DataTypes, Model } from "sequelize";
import { handle_exception, log } from "./io";

const DB_USR = process.env.GATEKEEPER_DB_USR;
const DB_PWD = process.env.GATEKEEPER_DB_PWD;
const DB_NAM = process.env.GATEKEEPER_DB_NAM;

let instance: DB;

export class Captcha extends Model {
    public id!: string;
    public user_id!: string;
    public answer!: string;
    public active!: boolean;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
};

export class DB {
    private connection: Sequelize;

    constructor() {
        this.connection = new Sequelize(DB_NAM, DB_USR, DB_PWD, {
            host: "localhost",
            dialect: "postgres",
            logging: (msg) => log(msg, LoggingLevel.DEV),
        })

        this.connection.authenticate().then(() => {
            log("Successfully connected to DB on localhost:5432");
        });

        this.init_models();

    }

    private init_models() {
        Captcha.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: Sequelize.literal("uuid_generate_v4()"),
                allowNull: false,
                primaryKey: true,
            },
            user_id: {
                type: DataTypes.STRING(256),
                allowNull: false,
            },
            answer: {
                type: DataTypes.STRING(256),
                allowNull: false,
            },
            active: {
                type: DataTypes.BOOLEAN,
                defaultValue: true,
                allowNull: false,
            }
        }, {
            sequelize: this.connection,
            tableName: "captchas",
        });
    }
}

export function connect() {
    if (!instance) {
        instance = new DB();
    }
    return instance;
}
