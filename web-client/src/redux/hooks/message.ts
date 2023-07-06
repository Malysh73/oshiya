import {useEffect} from 'react';
import {useDispatch} from 'react-redux';
import {newLog} from 'redux/slices/logs';
import {updateMiningStatus} from 'redux/slices/miner/miningStatus';
import {getZkpBalance} from 'redux/slices/miner/zkpBalance';
import {updateStats} from 'redux/slices/stats';
import {AppDispatch, useAppSelector} from 'redux/store';
import {workerManager} from 'services/worker-manager';
import {WorkerMessage} from 'types/worker';
import {isMessageOf} from 'utils/worker';
import {Stats} from '@panther-miner/sdk/lib';

export function useMessageHandler() {
    const dispatch = useDispatch<AppDispatch>();
    const minerParams = useAppSelector(state => state.miner.minerParams);

    useEffect(() => {
        workerManager.handleMessages(event => {
            if (
                isMessageOf<{message: string}>(WorkerMessage.Logs, event.data)
            ) {
                dispatch(newLog(event.data.message));
            }

            if (isMessageOf<{stats: Stats}>(WorkerMessage.Stats, event.data)) {
                dispatch(updateStats(event.data.stats));
                dispatch(getZkpBalance(minerParams));
            }

            if (
                isMessageOf<{isMining: boolean}>(
                    WorkerMessage.MiningStatus,
                    event.data,
                )
            ) {
                dispatch(updateMiningStatus(event.data.isMining));
            }
        });
    }, [minerParams]);
}
