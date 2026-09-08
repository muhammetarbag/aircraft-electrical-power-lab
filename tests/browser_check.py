"""Production UI acceptance checks. All writes go through actual UI controls."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, expect, sync_playwright

BASE_URL: str = os.environ.get('LAB_URL', 'http://127.0.0.1:3024/')
ARTIFACTS: Path = Path(__file__).resolve().parents[1] / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
checks: list[str] = []
errors: list[str] = []


def ok(name: str, condition: bool = True) -> None:
    assert condition, name
    checks.append(name)
    print(f'PASS {name}', flush=True)


def state(page: Page) -> dict[str, Any]:
    return page.evaluate('window.readElectricalState()')


def navigate(page: Page, name: str) -> None:
    menu = page.get_by_role('button', name='Modül menüsünü aç', exact=True)
    if menu.is_visible():
        menu.click()
    page.get_by_role('navigation', name='Laboratuvar modülleri').get_by_role('button', name=name, exact=True).click()


def pause(page: Page) -> None:
    button = page.get_by_role('button', name='Simülasyonu duraklat', exact=True)
    if button.count():
        button.click()


def play(page: Page, speed: str = '10') -> None:
    page.get_by_label('Simülasyon hızı', exact=True).select_option(speed)
    button = page.get_by_role('button', name='Simülasyonu oynat', exact=True)
    if button.count():
        button.click()


def reset(page: Page, preset: str = 'normal') -> None:
    page.get_by_label('Başlangıç senaryosu', exact=True).select_option(preset)
    pause(page)


def switch(page: Page, label: str, on: bool) -> None:
    button = page.get_by_role('switch', name=label, exact=True)
    if (button.get_attribute('aria-checked') == 'true') != on:
        button.click()


def slider(page: Page, label: str, value: int) -> None:
    locator = page.get_by_role('slider', name=label, exact=True)
    # Native keyboard events exercise React's real range handlers.
    minimum = float(locator.get_attribute('min') or '0')
    step = float(locator.get_attribute('step') or '1')
    locator.focus()
    locator.press('Home')
    for _ in range(round((value - minimum) / step)):
        locator.press('ArrowRight')


def run() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')
        pause(page)
        ok('normal landing: two sources and valid DC', state(page)['solution']['status'] == 'NORMAL')
        before = state(page)['state']
        page.wait_for_timeout(500)
        ok('pause freezes clock and energy', state(page)['state'] == before)
        page.get_by_role('button', name='Simülasyonu bir adım ilerlet', exact=True).click()
        ok('step advances exactly 0.2 s', abs(state(page)['state']['time'] - before['time'] - 0.2) < 1e-6)
        play(page)
        page.wait_for_function('window.readElectricalState().state.time > 5')
        pause(page)
        ok('time scale creates real history', len(state(page)['state']['history']) > 2)
        reset(page)
        page.screenshot(path=str(ARTIFACTS / 'desktop.png'))
        page.get_by_role('button', name='GEN 1 FAIL', exact=True).click()
        page.get_by_label('İncelenecek bileşen', exact=True).select_option('fuelLeft')
        q = state(page)['solution']
        ok('GEN failure trace includes tie, TRU and load', q['nodes']['fuelLeft']['path'] == ['gen2', 'ac2', 'ac1', 'tru1', 'dc1', 'fuelLeft'])
        expect(page.locator('.path-box')).to_contain_text('Left Fuel Pump')
        page.locator('.workspace').screenshot(path=str(ARTIFACTS / 'transfer.png'))
        page.get_by_role('button', name='TIE STUCK OPEN', exact=True).click()
        ok('tie failure removes AC BUS 1', not state(page)['solution']['nodes']['ac1']['powered'])
        navigate(page, 'Arıza enjeksiyonu')
        page.get_by_role('button', name='BUS TIE STUCK OPEN', exact=True).click()
        ok('fault removal restores alternate feed', state(page)['solution']['nodes']['ac1']['source'] == 'gen2')
        page.get_by_role('button', name='CLEAR ALL FAILURES', exact=True).click()
        ok('clear faults returns normal architecture', state(page)['solution']['status'] == 'NORMAL')
        page.get_by_role('button', name='BUS SHORT', exact=True).click()
        q = state(page)['solution']
        ok('short isolated while healthy side survives', not q['nodes']['ac1']['powered'] and q['nodes']['ac2']['powered'])
        page.get_by_role('button', name='BUS TIE STUCK CLOSED', exact=True).click()
        q = state(page)['solution']
        ok('welded tie plus short causes upstream isolation', not q['nodes']['ac2']['powered'] and q['nodes']['dcess']['source'] == 'battery')
        reset(page)
        page.get_by_role('button', name='TRU 1 FAIL', exact=True).last.click()
        ok('TRU failure preserves AC and removes local DC', state(page)['solution']['nodes']['ac1']['powered'] and not state(page)['solution']['nodes']['dc1']['powered'])
        navigate(page, 'Bus tie & transfer')
        page.get_by_label('DC BUS TIE', exact=True).select_option('AUTO')
        ok('DC alternate path restored through real tie', 'tru2' in state(page)['solution']['nodes']['dc1']['path'])
        reset(page)
        navigate(page, 'Koruma sistemleri')
        page.get_by_role('button', name='NAV Receiver circuit breaker', exact=True).click()
        ok('NAV CB open actually removes NAV', not state(page)['solution']['nodes']['nav']['powered'])
        page.get_by_role('button', name='NAV Receiver circuit breaker', exact=True).click()
        page.get_by_role('button', name='GALLEY SHORT CIRCUIT', exact=True).click()
        page.get_by_role('button', name='Galley circuit breaker', exact=True).click()
        ok('active branch short refuses CB reset', state(page)['state']['loads']['galley']['breaker'] == 'TRIPPED')
        page.get_by_role('button', name='GALLEY SHORT CIRCUIT', exact=True).click()
        page.get_by_role('button', name='Koruma reseti (eğitim)', exact=True).first.click()
        ok('safe recovery clears latched breaker', state(page)['state']['loads']['galley']['breaker'] == 'CLOSED')
        navigate(page, 'Batarya & standby')
        reset(page, 'cold')
        switch(page, 'BATTERY', True)
        ok('cold battery powers standby AC', state(page)['solution']['nodes']['acstby']['source'] == 'battery')
        switch(page, 'BATTERY', False)
        ok('BAT OFF preserves Hot Battery', state(page)['solution']['nodes']['hotbat']['powered'] and not state(page)['solution']['nodes']['batbus']['powered'])
        slider(page, 'Battery initial SOC', 0)
        ok('zero SOC removes battery supply', not state(page)['solution']['nodes']['hotbat']['powered'])
        reset(page, 'emergency')
        energy = state(page)['state']['energyWh']
        play(page)
        page.wait_for_function('window.readElectricalState().state.time >= 10')
        pause(page)
        ok('battery actually depletes in standby', state(page)['state']['energyWh'] < energy)
        endurance = state(page)['solution']['battery']['endurance']
        page.get_by_role('button', name='NAV Receiver switch', exact=True).click()
        ok('removing load improves calculated endurance', state(page)['solution']['battery']['endurance'] > endurance)
        switch(page, 'STATIC INVERTER', False)
        ok('inverter switch removes AC standby only', not state(page)['solution']['nodes']['acstby']['powered'] and state(page)['solution']['nodes']['dcess']['powered'])
        navigate(page, 'APU & haricî güç')
        reset(page, 'cold')
        page.get_by_role('button', name='APU START', exact=True).click()
        ok('APU start refuses absent starter conditions', not state(page)['state']['apuStarting'] and 'APU START REFUSED' in state(page)['state']['events'][-1]['text'])
        for label in ['GPU CABLE', 'GPU ON', 'EXT PWR ON', 'EXT PWR CONTACTOR']:
            switch(page, label, True)
        ok('cold GPU path energizes both AC buses', state(page)['solution']['nodes']['ac1']['source'] == 'ext' and state(page)['solution']['nodes']['ac2']['source'] == 'ext')
        page.locator('.source-grid .panel').filter(has=page.get_by_role('heading', name='EXT PWR', exact=True)).locator('summary').click()
        slider(page, 'EXT PWR Frequency', 330)
        ok('invalid GPU frequency rejected in UI', not state(page)['solution']['nodes']['ac1']['powered'])
        page.get_by_label('İncelenecek bileşen', exact=True).select_option('ext')
        page.get_by_label('Ölçüm aracı', exact=True).select_option('Frequency')
        expect(page.get_by_test_id('probe-reading')).to_contain_text('330.0 Hz')
        ok('maintenance probe measures rejected source terminals')
        slider(page, 'EXT PWR Frequency', 400)
        switch(page, 'BATTERY', True)
        energy = state(page)['state']['energyWh']
        play(page)
        page.wait_for_function('window.readElectricalState().state.time > 4')
        pause(page)
        ok('battery charges from valid GPU/TRU path', state(page)['state']['energyWh'] > energy)
        switch(page, 'APU MASTER', True)
        page.get_by_role('button', name='APU START', exact=True).click()
        play(page)
        page.wait_for_function('window.readElectricalState().state.apuRpm >= 95', timeout=10000)
        pause(page)
        switch(page, 'APU GEN ON', True)
        switch(page, 'APU GEN CONTACTOR', True)
        switch(page, 'EXT PWR CONTACTOR', False)
        ok('APU spin-up and GPU-to-APU transfer work', state(page)['solution']['nodes']['ac1']['source'] == 'apu')
        navigate(page, 'AC güç laboratuvarı')
        reset(page, 'cold')
        switch(page, 'ENGINE 1 START', True)
        switch(page, 'GEN 1 ON', True)
        switch(page, 'GEN 1 CONTACTOR', True)
        ok('engine output rejected before RPM threshold', not state(page)['solution']['sources']['gen1']['available'])
        play(page)
        page.wait_for_function('window.readElectricalState().state.rpm[0] >= 55')
        pause(page)
        ok('engine start produces valid source after spin-up', state(page)['solution']['nodes']['ac1']['source'] == 'gen1')
        wave = page.locator('.wave-chart path').nth(1).get_attribute('d')
        slider(page, 'Waveform frequency', 200)
        ok('three-phase frequency control changes waveform', wave != page.locator('.wave-chart path').nth(1).get_attribute('d'))
        expect(page.locator('.formula')).to_contain_text('280 W')
        slider(page, 'Calculation current', 20)
        expect(page.locator('.formula')).to_contain_text('560 W')
        ok('electrical formula controls compute real values')
        navigate(page, 'Yük yönetimi')
        reset(page)
        page.get_by_role('button', name='GEN 1 FAIL', exact=True).click()
        page.locator('.source-grid .panel').filter(has=page.get_by_role('heading', name='GEN 2', exact=True)).locator('summary').click()
        slider(page, 'GEN 2 Capacity', 18)
        ok('load shedding removes galley before essentials', 'galley' in state(page)['solution']['shed'] and state(page)['solution']['nodes']['nav']['powered'])
        reset(page)
        switch(page, 'AUTO LOAD SHEDDING', False)
        page.locator('.source-grid .panel').filter(has=page.get_by_role('heading', name='GEN 1', exact=True)).locator('summary').click()
        slider(page, 'GEN 1 Capacity', 8)
        ok('overload starts without instant trip', state(page)['solution']['sources']['gen1']['load'] > 100 and not state(page)['state']['trips'])
        play(page)
        page.wait_for_function('window.readElectricalState().state.trips.includes("gen1")')
        pause(page)
        ok('delayed overload protection trips source', 'gen1' in state(page)['state']['trips'])
        navigate(page, 'Rehberli deneyler')
        page.get_by_role('button', name='01 Yalnızca batarya', exact=True).click()
        pause(page)
        page.get_by_role('button', name='Canlı koşulu doğrula', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Koşul henüz')).to_be_visible()
        ok('guided lab refuses unmet condition')
        switch(page, 'BATTERY', True)
        page.get_by_role('button', name='Canlı koşulu doğrula', exact=True).click()
        for label in ['NAV Receiver switch', 'Flight Instruments switch']:
            page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('button', name='Canlı koşulu doğrula', exact=True).click()
        play(page)
        page.wait_for_function('window.readElectricalState().state.time >= 10')
        pause(page)
        page.get_by_role('button', name='Canlı koşulu doğrula', exact=True).click()
        expect(page.get_by_text('LAB COMPLETED', exact=True)).to_be_visible()
        ok('guided lab completes from actual live operations')
        navigate(page, 'Arıza teşhisi')
        page.get_by_role('button', name='02 DC BUS 1 DEAD / AC NORMAL', exact=True).click()
        expect(page.locator('.answer-list')).to_be_visible()
        ok('diagnosis begins with symptom, no verdict', page.get_by_text('Doğru teşhis.', exact=False).count() == 0)
        page.get_by_label('TRU 1 dönüşüm yolunun kaybı', exact=True).check()
        page.get_by_role('button', name='Teşhisi değerlendir', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Doğru teşhis')).to_be_visible()
        ok('diagnosis grading works')
        navigate(page, 'Bilgi & görev sınavı')
        page.get_by_role('radio', name='B GEN 1', exact=True).check()
        page.get_by_role('button', name='Cevabı kontrol et', exact=True).click()
        expect(page.locator('.feedback.correct')).to_be_visible()
        page.get_by_role('button', name='Soru 31', exact=True).click()
        page.get_by_role('textbox', name='Quiz cevabı', exact=True).fill('280')
        page.get_by_role('button', name='Cevabı kontrol et', exact=True).click()
        expect(page.locator('.feedback.correct')).to_be_visible()
        ok('multiple choice and numeric quiz grading work')
        page.reload()
        page.wait_for_load_state('networkidle')
        pause(page)
        saved = page.evaluate('JSON.parse(localStorage.getItem("ata24-lab-progress-v1"))')
        ok('quiz and lab progress survives reload', saved['labs'] == [0] and saved['answers']['0'] and saved['answers']['30'])
        navigate(page, 'Bilgi & görev sınavı')
        page.get_by_role('button', name='POWER THE LEFT FUEL PUMP', exact=False).click()
        pause(page)
        switch(page, 'ENGINE 2 START', True)
        switch(page, 'GEN 2 ON', True)
        switch(page, 'GEN 2 CONTACTOR', True)
        page.get_by_label('DC BUS TIE', exact=True).select_option('AUTO')
        play(page)
        page.wait_for_function('window.readElectricalState().solution.nodes.fuelLeft.powered')
        pause(page)
        page.get_by_role('button', name='Hedefi canlı sistemde değerlendir', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Görev tamamlandı')).to_be_visible()
        ok('power-the-load challenge completed through real alternate path')
        page.get_by_role('button', name='ISOLATE THE FAULT', exact=False).click()
        pause(page)
        switch(page, 'GEN 1 CONTACTOR', False)
        page.get_by_label('AC BUS TIE', exact=True).select_option('OPEN')
        page.get_by_role('button', name='Hedefi canlı sistemde değerlendir', exact=True).click()
        expect(page.get_by_role('status').filter(has_text='Görev tamamlandı')).to_be_visible()
        ok('isolation challenge preserves healthy network and scores')
        navigate(page, 'Sistem genel görünümü')
        reset(page)
        for label in ['BASIC', 'ENGINEERING', 'MAINTENANCE']:
            page.get_by_role('button', name=label, exact=True).click()
        ok('all three visualization levels operate')
        page.get_by_role('button', name='Şemayı yakınlaştır', exact=True).click()
        expect(page.locator('.diagram-tools')).to_contain_text('125%')
        page.get_by_role('button', name='Şema yakınlaştırmasını sıfırla', exact=True).click()
        ok('schematic zoom and reset work')
        page.get_by_role('button', name='gcb1 kontaktör CLOSED', exact=True).focus()
        page.keyboard.press('Enter')
        expect(page.locator('.inspector h3')).to_have_text('GCB1')
        ok('SVG contactor supports keyboard selection')
        with page.expect_download() as result:
            page.get_by_role('button', name='Olay kaydını indir', exact=True).click()
        result.value.save_as(ARTIFACTS / 'events-export.txt')
        ok('event log exports a local file', (ARTIFACTS / 'events-export.txt').stat().st_size > 0)
        page.get_by_role('button', name='CLEAR LOG', exact=True).click()
        ok('clear log empties actual event history', len(state(page)['state']['events']) == 0)
        modules = ['Sistem genel görünümü', 'AC güç laboratuvarı', 'DC & TRU laboratuvarı', 'Batarya & standby', 'APU & haricî güç', 'Bus tie & transfer', 'Yük yönetimi', 'Koruma sistemleri', 'Arıza enjeksiyonu', 'Arıza teşhisi', 'Serbest deney', 'Rehberli deneyler', 'Bilgi & görev sınavı', 'Bileşen gezgini']
        for name in modules:
            navigate(page, name)
            expect(page.get_by_role('heading', level=1)).to_be_visible()
            ok(f'desktop module renders without overflow: {name}', not page.evaluate('document.documentElement.scrollWidth > innerWidth'))
        mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
        mobile = mobile_context.new_page()
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        mobile.goto(BASE_URL)
        mobile.wait_for_load_state('networkidle')
        pause(mobile)
        mobile.screenshot(path=str(ARTIFACTS / 'mobile.png'))
        for name in modules:
            navigate(mobile, name)
            ok(f'mobile module stays within viewport: {name}', not mobile.evaluate('document.documentElement.scrollWidth > innerWidth'))
        navigate(mobile, 'Sistem genel görünümü')
        mobile.get_by_role('button', name='GEN 1 FAIL', exact=True).click()
        ok('mobile fault button changes real network', state(mobile)['solution']['nodes']['ac1']['source'] == 'gen2')
        mobile.locator('.diagram-scroll').evaluate('(el) => { el.scrollLeft = el.scrollWidth; }')
        ok('mobile diagram scroll preserves page layout', mobile.locator('.diagram-scroll').evaluate('(el) => el.scrollLeft > 0'))
        switch(mobile, 'GEN 2 ON', False)
        ok('mobile source control changes standby state', state(mobile)['solution']['nodes']['dcess']['source'] == 'battery')
        ok('no JavaScript console or page errors', not errors)
        summary = {'url': BASE_URL, 'checks_passed': len(checks), 'checks': checks, 'errors': errors}
        (ARTIFACTS / 'browser-results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
        print(json.dumps({'checks_passed': len(checks), 'errors': errors}), flush=True)
        browser.close()


if __name__ == '__main__':
    run()
