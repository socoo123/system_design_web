"""Real SQLite transaction probe of settle.pseudo, not a PostgreSQL/HA implementation."""
import json
from pathlib import Path
import re
import sqlite3


class Conflict(Exception): pass
class UnknownCommit(Exception): pass


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)


class Model:
    def __init__(self, path): self.path = str(path)
    def connect(self):
        c=sqlite3.connect(self.path,timeout=10,isolation_level=None)
        c.execute('PRAGMA foreign_keys=ON')
        return c
    def initialize(self):
        with self.connect() as c: c.executescript(Path(__file__).with_name('schema.sql').read_text())
    def seed(self,game='g1',season='s17',player='000000000007',region='r1'):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('INSERT OR IGNORE INTO seasons VALUES (?,?,?)',(game,season,'OPEN'))
            c.execute('INSERT OR IGNORE INTO memberships VALUES (?,?,?,?)',(game,season,player,region))
            c.commit()
    def settle(self, cmd, actor_game='g1', fail_before_commit=False, lose_ack=False):
        if cmd['game'] != actor_game: raise Conflict('authority')
        for key,lo,hi in [('seq',1,1_000_000_000),('score',0,1_000_000),('second',0,2_592_000),('revision',1,1_000_000)]:
            if type(cmd[key]) is not int or not lo <= cmd[key] <= hi: raise Conflict('bounds')
        if not re.fullmatch(r'[0-9]{12}',cmd['player']) or cmd['kind'] not in ('RESULT','CORRECTION'):
            raise Conflict('identity')
        if not isinstance(cmd['match'],str) or not cmd['match']: raise Conflict('identity')
        if cmd['comparator']!='score-time-id-v1': raise Conflict('comparator')
        key=(cmd['game'],cmd['season'],cmd['player'])
        event=canonical([*key,cmd['match'],cmd['kind'],cmd['revision']])
        intent=canonical([cmd['seq'],cmd['score'],cmd['second'],cmd['comparator']])
        c=self.connect()
        try:
            c.execute('BEGIN IMMEDIATE')
            gate=c.execute('SELECT state FROM seasons WHERE game=? AND season=?',key[:2]).fetchone()
            member=c.execute('SELECT region FROM memberships WHERE game=? AND season=? AND player=?',key).fetchone()
            if not gate or not member: raise Conflict('membership')
            old=c.execute('SELECT intent,original_receipt FROM receipts WHERE id=?',(event,)).fetchone()
            if old:
                if old[0]!=intent: raise Conflict('identity conflict')
                c.commit(); return json.loads(old[1])
            c.execute('INSERT INTO receipts VALUES (?,?,?)',(event,intent,'CLAIMED'))
            if gate[0]!='OPEN': receipt={'status':'REJECTED_CLOSED'}
            else:
                c.execute('INSERT OR IGNORE INTO scores VALUES (?,?,?,0,0,0)',key)
                row=c.execute('SELECT version FROM scores WHERE game=? AND season=? AND player=?',key).fetchone()
                if cmd['seq']<=row[0]: receipt={'status':'REJECTED_STALE'}
                else:
                    second=cmd['second']
                    composite=cmd['score']*3_000_001+3_000_000-second
                    c.execute('UPDATE scores SET version=?,score=?,second=? WHERE game=? AND season=? AND player=?',
                              (cmd['seq'],cmd['score'],second,*key))
                    for region in ['global',member[0]]:
                        board=':'.join([cmd['game'],cmd['season'],region])
                        c.execute('INSERT INTO outbox(event_id,board,player,game,season,version,composite) VALUES (?,?,?,?,?,?,?)',
                                  (event,board,cmd['player'],cmd['game'],cmd['season'],cmd['seq'],composite))
                    receipt={'status':'COMMITTED','version':cmd['seq'],'score':cmd['score'],'second':second}
            c.execute('UPDATE receipts SET original_receipt=? WHERE id=?',(canonical(receipt),event))
            if fail_before_commit: raise Conflict('injected rollback')
            c.commit()
            if lose_ack: raise UnknownCommit()
            return receipt
        except Exception:
            if c.in_transaction: c.rollback()
            raise
        finally: c.close()
    def close_season(self,game='g1',season='s17'):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute("UPDATE seasons SET state='CLOSING' WHERE game=? AND season=?",(game,season))
            # Finite identity set for this probe; production uses a gap-free stream frontier.
            rows=c.execute('SELECT event_id,board FROM outbox WHERE game=? AND season=? ORDER BY event_id,board',(game,season)).fetchall()
            c.commit();return rows
