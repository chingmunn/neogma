import { Session } from 'neo4j-driver/types/v1';
import { getDriver } from '../Driver';

/**
 * runs the callback in the given session if defined, else creates a new one
 * 
 * @param runInSession 
 * @param callback 
 */
export const acquireSession = async <T>(runInSession: Session, callback: (s: Session) => T) => {
    if (runInSession) {
        return callback(runInSession);
    }
    const session = getDriver().session();
    await callback(session);
    session.close();
};
